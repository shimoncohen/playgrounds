// Arithmetic track content (DOM-free). Chapter ids and order must match MQ.graph.chapters.arithmetic.
(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};
  const ok = { ok: true };
  const no = why => ({ ok: false, why });
  const finalNumber = MQ.check.final.number, finalFraction = MQ.check.final.fraction;
  const signed = v => (v < 0 ? '−' + -v : String(v));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const rect = (x0, y0, x1, y1, term) => ({ type: 'polygon', term, pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });

  const N = (label, value) => ({ min: 1, max: 9, step: 1, value, label });
  const width = s => String(s).length * 0.35 + 0.55;
  const chips = (toks, y) => {
    const gap = 0.2, total = toks.reduce((w, t) => w + (t[2] === false ? 0.4 : width(t[0])) + gap, -gap);
    let x = 5 - total / 2;
    const out = [];
    for (const [s, term, box] of toks) {
      const w = box === false ? 0.4 : width(s), cx = x + w / 2;
      if (box !== false) out.push({ type: 'polygon', term, pts: [[x, y - 0.45], [x + w, y - 0.45], [x + w, y + 0.45], [x, y + 0.45]] });
      out.push({ type: 'text', x: cx, y, s: String(s), term });
      x += w + gap;
    }
    return out;
  };
  const rows = ({ a, b, c }, t) => {
    const k = Math.min(2, Math.floor(t));
    return [
      [[[a, 'a'], ['+', 'add'], [b, 'b'], ['×', 'mul'], [c, 'c']], [[a, 'a'], ['+', 'add'], [b * c, 'mul']], [[a + b * c, 'add']]][k],
      [[['(', null, false], [a, 'a'], ['+', 'add'], [b, 'b'], [')', null, false], ['×', 'mul'], [c, 'c']], [[a + b, 'add'], ['×', 'mul'], [c, 'c']], [[(a + b) * c, 'mul']]][k],
    ];
  };
  const line = toks => toks.map(t => t[0]).join(' ').replace('( ', '(').replace(' )', ')');

  const order = {
    id: 'order-machine', title: 'Two rows: without brackets and with brackets',
    params: { a: N('a', 2), b: N('b', 3), c: N('c', 4) },
    terms: ['add', 'mul'],
    t: { min: 0, max: 3, step: 0.01, value: 0, speed: 0.8, label: 'step' },
    derived: p => ({ 'a + b × c': p.a + p.b * p.c, '(a + b) × c': (p.a + p.b) * p.c }),
    formula: '\\term{a}{a}\\term{add}{+}\\term{b}{b}\\term{mul}{\\times}\\term{c}{c}\\qquad(\\term{a}{a}\\term{add}{+}\\term{b}{b})\\term{mul}{\\times}\\term{c}{c}',
    live: s => { const [r1, r2] = rows(s.params, s.t); return `Step ${Math.min(2, Math.floor(s.t))}:  ${line(r1)}   and   ${line(r2)}`; },
    draw: {
      kind: '2d', view: [0, 10, 0, 4.5], box: [400, 180],
      items: s => {
        const [r1, r2] = rows(s.params, s.t);
        return [
          { type: 'text', x: 0.2, y: 4.15, s: 'No brackets', small: true, anchor: 'start' }, ...chips(r1, 3.25),
          { type: 'text', x: 0.2, y: 1.9, s: 'With brackets', small: true, anchor: 'start' }, ...chips(r2, 1),
        ];
      },
    },
  };

  // Sliders stop at ±5, so a target like −7 needs both arrows and cannot be read off one slider.
  const I = (label, value) => ({ min: -5, max: 5, step: 1, value, label });
  const numberLine = {
    id: 'number-line', title: 'Two arrows along the number line',
    params: { a: I('a', 2), b: I('b', -4) },
    terms: ['sum'],
    derived: p => ({ 'a + b': p.a + p.b }),
    formula: '\\term{a}{a} + \\term{b}{b} = \\term{sum}{a + b}',
    live: s => { const { a, b } = s.params; return `Start at 0, move ${signed(a)}, then move ${signed(b)}. Where does the dot land?`; },
    draw: {
      kind: '2d', view: [-11, 11, -0.7, 1], box: [400, 120],
      items: s => {
        const { a, b } = s.params;
        return [
          { type: 'axes' },
          { type: 'vector', from: [0, 0.35], to: [a, 0.35], term: 'a' },
          { type: 'vector', from: [a, 0.75], to: [a + b, 0.75], term: 'b' },
          { type: 'point', x: a + b, y: 0, term: 'sum' },
        ];
      },
    },
    story: {
      title: 'The cold cellar thermometer',
      live: s => { const { a, b } = s.params; return `At dusk the cellar thermometer reads ${signed(a)}°. Overnight it changes by ${signed(b)}°. What does Wick read at dawn?`; },
      draw: {
        kind: '2d', view: [-11, 11, -1.9, 1.2], box: [400, 217],
        items: s => {
          const { a, b } = s.params, t = a + b;
          // Labels are ~0.42 units a character: keep the night label above its arrow, off the 0° edge and inside the picture.
          const nightS = 'night ' + signed(b) + '°', w = nightS.length * 0.42;
          let nightX = a + b / 2;
          if (nightX - w / 2 < 0 && nightX + w / 2 > 0) nightX = (nightX < 0 ? -1 : 1) * (w / 2 + 0.2);
          nightX = Math.min(11 - w / 2 - 0.2, Math.max(-11 + w / 2 + 0.2, nightX));
          const mark = v => ({ type: 'text', x: v, y: -0.5, s: v ? signed(v) + '°' : '0°: water freezes', small: true });
          return [
            { type: 'polygon', pts: [[-11, -1.9], [0, -1.9], [0, 1.2], [-11, 1.2]], alpha: 0.12, stroke: false },
            { type: 'polygon', pts: [[-10.5, -0.15], [10.5, -0.15], [10.5, 0.15], [-10.5, 0.15]] },
            { type: 'polygon', pts: [[-10.5, -0.15], [t, -0.15], [t, 0.15], [-10.5, 0.15]], term: 'sum' },
            ...[-10, 0, 10].map(mark),
            { type: 'vector', from: [0, 0.35], to: [a, 0.35], term: 'a' },
            { type: 'text', x: a > 0 ? -0.3 : 0.3, y: 0.35, s: 'dusk ' + signed(a) + '°', small: true, anchor: a > 0 ? 'end' : 'start', term: 'a' },
            { type: 'vector', from: [a, 0.75], to: [t, 0.75], term: 'b' },
            { type: 'text', x: nightX, y: 0.97, s: nightS, small: true, term: 'b' },
            { type: 'point', x: t, y: 0, term: 'sum' },
            { type: 'icon', name: t < 0 ? 'snowflake' : 'sun', x: t, y: -0.95, term: 'sum' },
            { type: 'text', x: Math.min(10.2, Math.max(-10.2, t)), y: -1.27, s: 'dawn', small: true, term: 'sum' },
            { type: 'text', x: -10.8, y: -1.7, s: 'colder ← the cellar', small: true, anchor: 'start' },
            { type: 'text', x: 10.8, y: -1.7, s: 'warmer → the street', small: true, anchor: 'end' },
          ];
        },
      },
    },
  };

  const D = (label, value) => ({ min: 2, max: 6, step: 1, value, label });
  const bar = (y, d, n, term) => {
    const out = [rect(0, y, 10, y + 1), rect(0, y, 10 / d, y + 1, term), { type: 'text', x: 0, y: y + 1.4, s: `1/${d}`, term, small: true, anchor: 'start' }];
    for (let i = 1; i < n; i++) out.push({ type: 'polygon', term: 'n', pts: [[10 * i / n, y], [10 * i / n, y + 1]] });
    return out;
  };
  const fits = (d, n) => (n % d ? `1/${d} ends inside a piece` : `1/${d} = ${n / d}/${n}`);
  const bars = {
    id: 'fraction-bars', title: 'Two bars cut into the same pieces',
    params: { a: D('a', 4), b: D('b', 3), n: { min: 1, max: 24, step: 1, value: 1, label: 'n' } },
    derived: p => ({ 'n ÷ a': p.n / p.a, 'n ÷ b': p.n / p.b }),
    formula: '\\frac{1}{\\term{a}{a}} \\text{ and } \\frac{1}{\\term{b}{b}} \\text{, each bar cut into } \\term{n}{n} \\text{ pieces}',
    live: s => { const { a, b, n } = s.params; return `${n} piece${n === 1 ? '' : 's'}: ${fits(a, n)}, and ${fits(b, n)}`; },
    draw: {
      kind: '2d', view: [-0.3, 10.3, 0, 4.4], box: [400, 170],
      items: s => { const { a, b, n } = s.params; return [...bar(2.4, a, n, 'a'), ...bar(0.4, b, n, 'b')]; },
    },
  };

  const tiles = {
    id: 'square-tiles', title: 'A square of tiles',
    params: { n: { min: 1, max: 10, step: 1, value: 3, label: 'n' } },
    terms: ['sq'],
    derived: p => ({ 'n²': p.n * p.n }),
    formula: '\\term{n}{n} \\times \\term{n}{n} = \\term{sq}{n^2}',
    live: s => { const { n } = s.params; return `${n} × ${n} = ${n}² = ${n * n} tiles`; },
    draw: {
      kind: '2d', view: [-0.6, 10.6, -0.9, 10.3], box: [300, 300],
      items: s => {
        const { n } = s.params, out = [];
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push(rect(i + 0.06, j + 0.06, i + 0.94, j + 0.94, 'sq'));
        out.push({ type: 'text', x: n / 2, y: -0.5, s: `n = ${n}`, term: 'n', small: true });
        return out;
      },
    },
  };

  const R = (label, value) => ({ min: 1, max: 18, step: 1, value, label });
  const pct = (x, all) => +(100 * x / all).toFixed(1);
  const ratioBar = {
    id: 'ratio-bar', title: 'A bar split in a ratio',
    params: { a: R('a', 1), b: R('b', 1) },
    derived: p => ({ 'a %': pct(p.a, p.a + p.b), 'b %': pct(p.b, p.a + p.b) }),
    formula: '\\term{a}{a} : \\term{b}{b} \\qquad \\frac{\\term{a}{a}}{\\term{a}{a} + \\term{b}{b}} \\times 100\\%',
    live: s => { const { a, b } = s.params, t = a + b; return `${a} : ${b}. Part a is ${a} of ${t} parts, ${pct(a, t)}%. Part b is ${b} of ${t}, ${pct(b, t)}%.`; },
    draw: {
      kind: '2d', view: [-0.3, 10.3, 0, 3], box: [400, 120],
      items: s => {
        const { a, b } = s.params, t = a + b, w = 10 / t, out = [];
        for (let i = 0; i < t; i++) out.push(rect(i * w, 1.2, (i + 1) * w, 2.4, i < a ? 'a' : 'b'));
        out.push({ type: 'text', x: a * w / 2, y: 0.6, s: `${pct(a, t)}%`, term: 'a', small: true });
        out.push({ type: 'text', x: a * w + b * w / 2, y: 0.6, s: `${pct(b, t)}%`, term: 'b', small: true });
        return out;
      },
    },
  };

  const dash = (x0, y0, w, h, term) => {
    const out = [];
    for (const [ax, ay, bx, by] of [[x0, y0, x0 + w, y0], [x0 + w, y0, x0 + w, y0 + h], [x0, y0 + h, x0 + w, y0 + h], [x0, y0, x0, y0 + h]]) {
      const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / 0.12 / 2)) * 2 - 1;
      for (let i = 0; i < n; i += 2) out.push({ type: 'polygon', term, pts: [[ax + (bx - ax) * i / n, ay + (by - ay) * i / n], [ax + (bx - ax) * (i + 1) / n, ay + (by - ay) * (i + 1) / n]] });
    }
    return out;
  };
  const sup = n => String(n).replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
  const br = v => (v < 0 ? `(${signed(v)})` : String(v));
  const sq = (x0, y0, w, h, term) => rect(x0, y0, x0 + w, y0 + h, term);

  const wash = (x0, y0, x1, y1) => ({ ...rect(x0, y0, x1, y1), alpha: 0.12, stroke: false });
  const icon = (name, x, y, size = 20) => ({ type: 'icon', name, x, y, size });
  const say = (items, f) => items.map(it => (it.type === 'text' ? { ...it, s: f(it.s) } : it));
  // A story picture reuses the plain items (so every arrow, point and mission-named mark stays put) and adds the world around them.
  const dressed = (plain, title, live, build, look) => ({ title, live, draw: { ...plain.draw, ...look, items: s => build(plain.draw.items(s), s) } });

  const chain = (id, tex, stages, world) => {
    const plain = {
      id, title: 'The line, one step at a time',
      params: {},
      terms: ['now'],
      t: { min: 0, max: stages.length - 1, step: 0.01, value: 0, speed: 0.5, label: 'step' },
      formula: tex,
      live: s => { const k = Math.floor(s.t); return `Line ${k + 1} of ${stages.length}: ${stages[k][0]}`; },
      draw: {
        kind: '2d', view: [0, 10, 0, stages.length * 1.2], box: [420, 52 * stages.length],
        items: s => {
          const k = Math.floor(s.t), out = [];
          for (let i = 0; i <= k; i++) {
            const y = (stages.length - i - 0.5) * 1.2;
            if (i === k) out.push(rect(0.05, y - 0.55, 9.95, y + 0.55, 'now'));
            out.push({ type: 'text', x: 0.3, y: y + 0.22, s: stages[i][0], anchor: 'start' }, { type: 'text', x: 0.3, y: y - 0.3, s: stages[i][1], small: true, anchor: 'start' });
          }
          return out;
        },
      },
    };
    plain.story = dressed(plain, world.title, s => `${world.line} ${Math.floor(s.t) + 1} of ${stages.length}: ${stages[Math.floor(s.t)][0]}`,
      items => [wash(0, 0, 10, stages.length * 1.2), icon(world.icon, 9.6, (stages.length - 0.5) * 1.2 + 0.2), ...items]);
    return plain;
  };
  const orderChain = chain('order-chain', '1 \\times 2 - 3 \\times 2 + 10 \\div (2 - 1)', [
    ['1 × 2 − 3 × 2 + 10 ÷ (2 − 1)', 'the line to work out'],
    ['1 × 2 − 3 × 2 + 10 ÷ 1', 'bracket first: 2 − 1 is 1'],
    ['2 − 6 + 10', '× and ÷ next: 1 × 2, 3 × 2, 10 ÷ 1'],
    ['−4 + 10', '+ and − from the left: 2 − 6 is −4'],
  ], { title: 'Pim\'s chalk board, one line at a time', line: 'Chalk line', icon: 'board' });
  const plusChain = chain('plus-minus-chain', '10 - 4 + 2 \\times 3', [
    ['10 − 4 + 2 × 3', 'the line to work out'],
    ['10 − 4 + 6', '× first: 2 × 3 is 6'],
    ['6 + 6', '+ and − from the left: 10 − 4 is 6'],
  ], { title: 'Pim\'s chalk board, one line at a time', line: 'Chalk line', icon: 'board' });
  const negChain = chain('negative-chain', '8 - (3 - 10) + (-2) \\times 3', [
    ['8 − (3 − 10) + (−2) × 3', 'the line to work out'],
    ['8 − (−7) + (−2) × 3', 'bracket first: 3 − 10 is −7'],
    ['8 − (−7) + (−6)', '× next: (−2) × 3 is −6'],
    ['15 + (−6)', 'taking away −7 is adding 7'],
  ], { title: 'The cellar tally, one line at a time', line: 'Tally line', icon: 'coin' });
  const fracChain = chain('fraction-chain', '\\frac{1}{2} + \\frac{3}{4} \\times \\frac{2}{3} - \\frac{1}{3}', [
    ['1/2 + 3/4 × 2/3 − 1/3', 'the line to work out'],
    ['1/2 + 6/12 − 1/3', '× first: tops 3 × 2, bottoms 4 × 3'],
    ['1/2 + 1/2 − 1/3', '6/12 simplifies to 1/2'],
    ['1 − 1/3', '1/2 + 1/2 is 1'],
  ], { title: 'The baker\'s slate, one line at a time', line: 'Slate line', icon: 'loaf' });

  const divTimes = {
    id: 'divide-then-times', title: 'Cut into parts, then take copies',
    params: { a: { min: 2, max: 24, step: 1, value: 12, label: 'a' }, b: { min: 1, max: 6, step: 1, value: 2, label: 'b' }, c: { min: 1, max: 6, step: 1, value: 3, label: 'c' } },
    formula: '\\term{a}{a} \\div \\term{b}{b} \\times \\term{c}{c}',
    live: s => { const { a, b, c } = s.params; return `${a} cut into ${b} equal part${b === 1 ? '' : 's'}, then ${c} of those parts. Compare the two bars.`; },
    draw: {
      kind: '2d', view: [-0.3, 10.3, 0, 6], box: [400, 240],
      items: s => {
        const { a, b, c } = s.params, k = 10 / Math.max(a, a * c / b), w = a / b * k, out = [];
        out.push({ type: 'text', x: 0, y: 5.5, s: `${a} cut into ${b} equal part${b === 1 ? '' : 's'}`, small: true, anchor: 'start' });
        for (let i = 0; i < b; i++) out.push(sq(i * w, 4, w, 1, 'a'));
        out.push({ type: 'text', x: 0, y: 2.7, s: `${c} of those parts, side by side`, small: true, anchor: 'start' });
        for (let i = 0; i < c; i++) out.push(sq(i * w, 1.2, w, 1, 'c'));
        return out;
      },
    },
  };

  const product = {
    id: 'signed-product', title: 'A rectangle in four quarters',
    params: { a: I('a', -4), b: I('b', -2) },
    terms: ['prod'],
    formula: '\\term{a}{a} \\times \\term{b}{b} = \\term{prod}{\\text{the rectangle}}',
    live: s => {
      const { a, b } = s.params;
      return a && b ? `${br(a)} × ${br(b)}: ${Math.abs(a)} across, ${Math.abs(b)} up. A filled rectangle is a positive amount, a dashed one is a taken-away amount.` : `${br(a)} × ${br(b)}: a zero makes the rectangle flat.`;
    },
    draw: {
      kind: '2d', view: [-6, 6, -6, 6], box: [320, 320],
      items: s => {
        const { a, b } = s.params;
        return [
          { type: 'grid' }, { type: 'axes' },
          ...(a && b ? (a * b > 0 ? [rect(0, 0, a, b, 'prod')] : dash(Math.min(0, a), Math.min(0, b), Math.abs(a), Math.abs(b), 'prod')) : []),
          { type: 'text', x: 5.2, y: 5.2, s: '+', small: true }, { type: 'text', x: -5.2, y: -5.2, s: '+', small: true },
          { type: 'text', x: -5.2, y: 5.2, s: '−', small: true }, { type: 'text', x: 5.2, y: -5.2, s: '−', small: true },
          { type: 'point', x: a, y: b, term: 'prod', drag: { x: 'a', y: 'b' }, label: 'corner of the rectangle: a across, b up' },
        ];
      },
    },
  };

  const debt = {
    id: 'shared-debt', title: 'A debt shared out',
    params: { d: { min: 1, max: 24, step: 1, value: 12, label: 'd: coins owed' }, k: { min: 1, max: 6, step: 1, value: 3, label: 'k: friends' } },
    terms: ['share'],
    formula: '\\term{d}{-d} \\div \\term{k}{k} = \\term{share}{\\text{each share}}',
    live: s => { const { d, k } = s.params; return `${d} coins owed, dealt out one at a time to ${k} friend${k === 1 ? '' : 's'}. Dashed squares are owed coins.${d % k ? ' They do not share out evenly.' : ''}`; },
    draw: {
      kind: '2d', view: [0, 10, 0, 7], box: [400, 260],
      items: s => {
        const { d, k } = s.params, rows = Math.ceil(d / k), cell = Math.min(0.7, 5 / rows), cw = Math.min(0.7, 10 / k * 0.6), out = [];
        for (let i = 0; i < d; i++) out.push(...dash(10 / k * (i % k + 0.5) - cw / 2, 1.3 + Math.floor(i / k) * cell, cw * 0.9, cell * 0.85, 'share'));
        for (let g = 0; g < k; g++) out.push({ type: 'text', x: 10 / k * (g + 0.5), y: 0.6, s: `friend ${g + 1}`, small: true });
        return out;
      },
    },
  };

  const areaModel = {
    id: 'area-model', title: 'A square cut both ways',
    params: { a: { min: 1, max: 5, step: 1, value: 2, label: 'a: columns shaded' }, b: { min: 2, max: 6, step: 1, value: 3, label: 'b: columns in all' }, c: { min: 1, max: 5, step: 1, value: 4, label: 'c: rows shaded' }, d: { min: 2, max: 6, step: 1, value: 5, label: 'd: rows in all' } },
    terms: ['prod'],
    formula: '\\frac{\\term{a}{a}}{\\term{b}{b}} \\times \\frac{\\term{c}{c}}{\\term{d}{d}} = \\term{prod}{\\text{the cells shaded both ways}}',
    live: s => { const { b, d } = s.params, a = Math.min(s.params.a, b), c = Math.min(s.params.c, d); return `${a}/${b} × ${c}/${d}: ${a} of ${b} columns and ${c} of ${d} rows. Count the cells shaded both ways, and all the cells. (A top above its bottom stops at the whole square.)`; },
    draw: {
      kind: '2d', view: [-0.5, 10.5, -1.2, 10.4], box: [320, 335],
      items: s => {
        const { b, d } = s.params, a = Math.min(s.params.a, b), c = Math.min(s.params.c, d), x0 = 1.2, S = 8, out = [];
        for (let i = 0; i < b; i++) for (let j = 0; j < d; j++) {
          const col = i < a, row = j >= d - c;
          out.push(sq(x0 + i * S / b, 1.4 + j * S / d, S / b, S / d, col && row ? 'prod' : col ? 'a' : row ? 'c' : undefined));
        }
        out.push({ type: 'text', x: 5.2, y: 0.8, s: `${a} of ${b} columns`, small: true, term: 'a' }, { type: 'text', x: 5.2, y: 0.1, s: `${c} of ${d} rows`, small: true, term: 'c' });
        return out;
      },
    },
  };

  const groups = {
    id: 'fraction-groups', title: 'Groups of pieces that make a fraction smaller',
    params: { top: { min: 1, max: 24, step: 1, value: 18, label: 'top: pieces taken' }, bottom: { min: 2, max: 24, step: 1, value: 24, label: 'bottom: pieces in all' }, g: { min: 1, max: 12, step: 1, value: 1, label: 'g: pieces per group' } },
    terms: ['cut'],
    formula: '\\frac{\\term{top}{top}}{\\term{bottom}{bottom}} = \\frac{\\term{top}{top} \\div \\term{g}{g}}{\\term{bottom}{bottom} \\div \\term{g}{g}}',
    live: s => {
      const { bottom: u, g } = s.params, t = Math.min(s.params.top, u);
      if (t % g || u % g) return `${t}/${u}: groups of ${g} do not fit both numbers exactly.`;
      return `${t}/${u} in groups of ${g}: ${t / g} of ${u / g} groups, ${t / g}/${u / g}${gcd(t / g, u / g) === 1 ? ', the simplest form' : ', which can still be simplified'}.`;
    },
    draw: {
      kind: '2d', view: [-0.3, 10.3, 0, 4], box: [400, 160],
      items: s => {
        const { bottom: u, g } = s.params, t = Math.min(s.params.top, u), w = 10 / u, out = [];
        for (let i = 0; i < u; i++) out.push(sq(i * w, 1.4, w, 1.2, i < t ? 'top' : undefined));
        if (g > 1) for (let i = g; i < u; i += g) out.push(sq(i * w - 0.03, 1.2, 0.06, 1.6, 'cut'));
        out.push({ type: 'text', x: 0, y: 3.4, s: `${t} of ${u} pieces`, small: true, anchor: 'start' });
        if (!(t % g || u % g)) out.push({ type: 'text', x: 0, y: 0.6, s: `${t / g} of ${u / g} groups of ${g}`, small: true, anchor: 'start', term: 'cut' });
        return out;
      },
    },
  };

  const cube = {
    id: 'power-cube', title: 'Layers of squares',
    params: { n: { min: 1, max: 5, step: 1, value: 2, label: 'n: the base' }, e: { min: 1, max: 3, step: 1, value: 3, label: 'e: the exponent' } },
    terms: ['v'],
    formula: '\\term{n}{n}^{\\term{e}{e}} = \\term{v}{\\text{the tiles}}',
    live: s => { const { n, e } = s.params; return `${n}${sup(e)}: ${e} cop${e === 1 ? 'y' : 'ies'} of ${n} multiplied. Count the tiles.`; },
    draw: {
      kind: '2d', view: [-0.5, 8.5, -1.3, 8.3], box: [320, 313],
      items: s => {
        const { n, e } = s.params, layers = e === 3 ? n : 1, o = 0.45, out = [];
        const h = e === 1 ? 1 : n;
        for (let i = layers - 1; i > 0; i--) out.push(sq(i * o, i * o, n, h, 'v'));
        for (let x = 0; x < n; x++) for (let y = 0; y < h; y++) out.push(sq(x + 0.04, y + 0.04, 0.92, 0.92, 'v'));
        out.push({ type: 'text', x: 4, y: -0.7, s: e === 1 ? `${n} tile${n === 1 ? '' : 's'}` : e === 2 ? `${n} rows of ${n}` : `${n} layer${n === 1 ? '' : 's'} of ${n} × ${n}`, small: true });
        return out;
      },
    },
  };

  const squares = {
    id: 'minus-and-square', title: 'A square with the minus outside, and inside',
    params: { c: { min: 1, max: 5, step: 1, value: 2, label: 'c' } },
    terms: ['neg', 'pos'],
    formula: '-\\term{neg}{c^2} + \\term{pos}{(-c)^2}',
    live: s => { const { c } = s.params; return `−${c}²: ${c} is squared first, then the minus goes in front, so the tiles are taken away (dashed). (−${c})²: the whole bracket is squared (filled).`; },
    draw: {
      kind: '2d', view: [0, 10, 0, 7], box: [400, 260],
      items: s => {
        const { c } = s.params, w = Math.min(1.6, 4.2 / c), out = [];
        for (const [x0, term] of [[2.5, 'neg'], [7.5, 'pos']]) for (let i = 0; i < c; i++) for (let j = 0; j < c; j++) out.push(...(term === 'neg' ? dash : (...r) => [sq(...r)])(x0 - c * w / 2 + i * w, 1.5 + j * w, w * 0.92, w * 0.92, term));
        out.push({ type: 'text', x: 2.5, y: 6.4, s: `−${c}²`, term: 'neg' }, { type: 'text', x: 7.5, y: 6.4, s: `(−${c})²`, term: 'pos' });
        return out;
      },
    },
  };

  const sameBase = {
    id: 'same-base', title: 'Copies of one base, joined',
    params: { b: { min: 2, max: 5, step: 1, value: 3, label: 'b: the base' }, p: { min: 1, max: 5, step: 1, value: 2, label: 'p: first exponent' }, q: { min: 1, max: 5, step: 1, value: 3, label: 'q: second exponent' } },
    formula: '\\term{b}{b}^{\\term{p}{p}} \\times \\term{b}{b}^{\\term{q}{q}}',
    live: s => { const { b, p, q } = s.params; return `${b}${sup(p)} × ${b}${sup(q)}: ${p} copies of ${b} and ${q} copies of ${b}. Count the copies in the bottom row.`; },
    draw: {
      kind: '2d', view: [0, 10, 0, 7.2], box: [400, 290],
      items: s => {
        const { b, p, q } = s.params, w = 0.8, out = [];
        const row = (y, n, from, label) => {
          out.push({ type: 'text', x: 0.2, y, s: label, small: true, anchor: 'start' });
          for (let i = 0; i < n; i++) {
            const term = from(i);
            out.push(sq(0.2 + i * 0.9, y - 1.15, w, 0.9, term), { type: 'text', x: 0.2 + i * 0.9 + w / 2, y: y - 0.7, s: String(b), term });
          }
        };
        row(6.6, p, () => 'p', `${b}${sup(p)}: ${p} copies of ${b}`);
        row(4.3, q, () => 'q', `${b}${sup(q)}: ${q} copies of ${b}`);
        row(2.0, p + q, i => (i < p ? 'p' : 'q'), 'all the copies together');
        return out;
      },
    },
  };

  const percent = grow => {
    const plain = {
      id: grow ? 'percent-increase' : 'percent-of', title: grow ? 'A bar that grows by a percentage' : 'A percentage of a bar',
      params: { base: { min: 10, max: 200, step: 10, value: grow ? 40 : 80, label: 'base: the amount' }, pct: { min: 5, max: grow ? 50 : 100, step: 5, value: grow ? 25 : 15, label: 'pct: percent' } },
      terms: ['part'],
      formula: grow ? '\\term{base}{\\text{base}} + \\term{pct}{\\text{pct}}\\% \\text{ of } \\term{base}{\\text{base}}' : '\\term{pct}{\\text{pct}}\\% \\text{ of } \\term{base}{\\text{base}} = \\term{part}{\\text{the shaded part}}',
      live: s => { const { base, pct } = s.params; return grow ? `${base} grown by ${pct}%: the new piece is ${pct}% of ${base}, added on the end.` : `${pct}% of ${base} is the shaded part of the bar.`; },
      draw: {
        kind: '2d', view: [-0.3, 10.3, 0, 4], box: [400, 150],
        items: s => {
          const { base, pct } = s.params, W = grow ? 10 / 1.5 : 10, w = W * pct / 100;
          return grow
            ? [sq(0, 1.4, W, 1.2, 'base'), sq(W, 1.4, w, 1.2, 'part'),
              { type: 'text', x: W / 2, y: 0.7, s: String(base), small: true, term: 'base' }, { type: 'text', x: W + w / 2, y: 0.7, s: `+${pct}%`, small: true, term: 'part' },
              { type: 'text', x: 0, y: 3.4, s: `${base} grown by ${pct}%`, small: true, anchor: 'start' }]
            : [sq(0, 1.4, W, 1.2, 'base'), sq(0, 1.4, w, 1.2, 'part'),
              { type: 'text', x: w / 2, y: 0.7, s: `${pct}%`, small: true, term: 'part' }, { type: 'text', x: 10, y: 0.7, s: String(base), small: true, anchor: 'end' },
              { type: 'text', x: 0, y: 3.4, s: `${pct}% of ${base}`, small: true, anchor: 'start' }];
        },
      },
    };
    plain.story = dressed(plain, grow ? 'The jacket price bar, grown' : 'The jacket price bar',
      s => { const { base, pct } = s.params; return grow ? `The jacket costs ${base} coins, grown by ${pct}%: the new piece is ${pct}% of ${base}, added on the end.` : `The jacket costs ${base} coins: ${pct}% of ${base} is the shaded part of the price bar.`; },
      (items, s) => { const { base, pct } = s.params; return [icon('tag', 9.6, 3.4), ...items.map(it => (it.y === 3.4 ? { ...it, s: grow ? `the jacket's ${base} coins, grown by ${pct}%` : `${pct}% of the jacket's ${base} coins` } : it))]; });
    return plain;
  };

  order.story = dressed(order, 'The price board: two chalk rows',
    s => { const [r1, r2] = rows(s.params, s.t); return `Pim chalks two rows on the price board. Step ${Math.min(2, Math.floor(s.t))}:  ${line(r1)}   and   ${line(r2)}`; },
    items => [wash(0, 0, 10, 4.5), icon('board', 9.6, 4.05), ...say(items, t => ({ 'No brackets': 'Row 1: no brackets', 'With brackets': 'Row 2: with brackets' })[t] ?? t)]);

  bars.story = dressed(bars, 'Pim\'s pie and the baker\'s loaf, cut in pieces',
    s => { const { a, b, n } = s.params; return `The baker's loaf and Pim's pie, ${n} piece${n === 1 ? '' : 's'} each: the loaf, ${fits(a, n)}; the pie, ${fits(b, n)}`; },
    items => [...items,
      icon('loaf', 9.6, 3.8), icon('pie', 9.6, 1.8),
      { type: 'text', x: 1.3, y: 3.8, s: 'the baker\'s loaf', small: true, anchor: 'start' }, { type: 'text', x: 1.3, y: 1.8, s: 'Pim\'s pie', small: true, anchor: 'start' }]);

  tiles.story = dressed(tiles, 'The tile-sellers\' yard',
    s => { const { n } = s.params; return `Wick lays ${n} row${n === 1 ? '' : 's'} of ${n} tile${n === 1 ? '' : 's'} in the yard: ${n} × ${n} = ${n}² = ${n * n} tiles`; },
    items => [wash(-0.6, -1.9, 10.6, -1), icon('tile', 0.3, -1.45), { type: 'text', x: 10.4, y: -1.45, s: 'the tile-sellers\' yard', small: true, anchor: 'end' }, ...items],
    { view: [-0.6, 10.6, -1.9, 10.3], box: [300, 327] });

  ratioBar.story = dressed(ratioBar, 'Stickers shared between Wick and Dot',
    s => { const { a, b } = s.params, t = a + b; return `Wick and Dot share stickers ${a} : ${b}. Wick gets ${a} of ${t} parts, ${pct(a, t)}%. Dot gets ${b} of ${t}, ${pct(b, t)}%.`; },
    items => [...items, icon('star', 0.3, 2.85, 16),
      { type: 'text', x: 0.7, y: 2.85, s: 'Wick\'s stickers', small: true, anchor: 'start', term: 'a' }, { type: 'text', x: 10, y: 2.85, s: 'Dot\'s stickers', small: true, anchor: 'end', term: 'b' }],
    { view: [-0.3, 10.3, 0, 3.4], box: [400, 136] });

  divTimes.story = dressed(divTimes, 'Wick\'s coin piles',
    s => { const { a, b, c } = s.params; return `${a} coins cut into ${b} equal pile${b === 1 ? '' : 's'}, then ${c} of those piles. Compare the two bars.`; },
    items => [icon('coin', 9.7, 5.5), icon('coin', 9.7, 2.7), ...say(items, t => t.replace(' cut into', ' coins cut into').replace(/parts?/, m => (m === 'parts' ? 'piles' : 'pile')))]);

  product.story = dressed(product, 'Pim\'s coin board',
    s => {
      const { a, b } = s.params;
      return a && b ? `${br(a)} × ${br(b)} coins: ${Math.abs(a)} across, ${Math.abs(b)} up. A filled rectangle is coins in the purse, a dashed one is coins taken away.` : `${br(a)} × ${br(b)} coins: a zero makes the rectangle flat.`;
    },
    items => [wash(0, 0, 6, 6), wash(-6, -6, 0, 0), ...items]);

  debt.story = dressed(debt, 'Coins owed between the stalls',
    s => { const { d, k } = s.params; return `${d} coin${d === 1 ? '' : 's'} owed, dealt out one at a time to ${k} stall${k === 1 ? '' : 's'}. Dashed squares are owed coins.${d % k ? ' They do not share out evenly.' : ''}`; },
    items => [wash(0, 0, 10, 1), icon('coin', 9.5, 6.5), ...say(items, t => t.replace('friend', 'stall'))]);

  areaModel.story = dressed(areaModel, 'The baker\'s tray cut both ways',
    s => { const { b, d } = s.params, a = Math.min(s.params.a, b), c = Math.min(s.params.c, d); return `${a}/${b} × ${c}/${d} of the baker's tray: ${a} of ${b} columns and ${c} of ${d} rows. Count the cells shaded both ways, and all the cells. (A top above its bottom stops at the whole tray.)`; },
    items => [...items, icon('loaf', 9.6, 10.2), { type: 'text', x: 1.2, y: 10.2, s: 'the baker\'s tray', small: true, anchor: 'start' }],
    { view: [-0.5, 10.5, -1.2, 10.9], box: [320, 350] });

  groups.story = dressed(groups, 'Pim\'s pie in groups of pieces',
    s => `Pim's pie: ${groups.live(s)}`,
    items => [icon('pie', 9.6, 3.4), ...say(items, t => t.replace(/ pieces$/, ' pieces of Pim\'s pie'))]);

  cube.story = dressed(cube, 'The tile-sellers\' stack',
    s => { const { n, e } = s.params; return `${n}${sup(e)}: ${e} cop${e === 1 ? 'y' : 'ies'} of ${n} multiplied. Count the tiles in the tile-sellers' stack.`; },
    items => [wash(-0.5, -1.3, 8.5, 0), icon('tile', 8, 7.7), ...items]);

  squares.story = dressed(squares, 'Two tile stacks in the yard',
    s => `Two tile stacks. ${squares.live(s)}`,
    items => [wash(0, 0.2, 10, 1.2), { type: 'text', x: 5, y: 0.7, s: 'the tile-sellers\' yard', small: true }, icon('tile', 9.6, 6.4), ...items]);

  sameBase.story = dressed(sameBase, 'Tiles stamped with one base',
    s => { const { b, p, q } = s.params; return `${b}${sup(p)} × ${b}${sup(q)}: ${p} copies of ${b} and ${q} copies of ${b}, one tile each. Count the tiles in the bottom row.`; },
    items => [icon('tile', 9.6, 6.6), ...items]);

  MQ.content = {
    track: 'arithmetic',
    ranks: [[0, 'Counter'], [30, 'Bracket Breaker'], [75, 'Price Chalker'], [150, 'Sign Switcher'], [225, 'Pie Slicer'], [300, 'Tile Setter'], [375, 'Ratio Ranger']],
    chapters: [{
      id: 'arithmetic.order', name: 'Order of operations', badge: 'Price Card',
      story: 'The price board has many sums chalked on it, so you work each in the right order to open the card that lists Pim\'s first stall and find the price card.',
      intro: 'Pim hid her lucky purse and chalked a price clue at every stall. The price board is covered in sums, and the right answer opens the card that points to her first stall. +, −, × and ÷ are called <b>operations</b>. A line with several of them can be read in more than one way: <code>6 + 4 × 3</code> is 30 if you add first and 18 if you multiply first. The <b>order of operations</b> is the rule everyone agrees on, so every line has one answer. Under each question you write your <b>working</b>: one step per line, each a shorter version of the line above. Your last line is your answer.',
      scene: order,
      missions: [
        { title: 'Brackets first', kind: 'number', question: '(6+4)*3', tex: '(6 + 4) \\times 3',
          goal: 'Work out <code>(6 + 4) × 3</code>. Write one step per line under the question, and finish with one number.',
          how: [
            'The whole line adds 6 and 4, then multiplies that total by 3: brackets mean "work me out first".',
            '<code>(6 + 4)</code> comes first: it is 10. So your first step is <code>10 × 3</code> (type <code>10*3</code>).',
            '<code>× 3</code> then works on that 10: <code>10 × 3</code> is 30.',
            'Your last line, <code>30</code>, is the answer. Without the brackets, <code>6 + 4 × 3</code> is 18: the brackets changed the answer.',
          ],
          explain: 'On a keyboard, × is <code>*</code> and ÷ is <code>/</code>. The preview may show × as a raised dot, <code>·</code>: it means the same thing. Press <kbd>Enter</kbd> for a new line.',
          hint: 'Work out the bracket first: what is <code>6 + 4</code>? Then multiply that by 3.',
          scene: { ...order, t: { ...order.t, max: 1 } }, at: { a: 6, b: 4, c: 3 }, reveal: true,
          answer: '30', wrong: '18', lazy: '(6+4)*3', check: finalNumber(30) },
        { title: 'Times and divide: left to right', kind: 'number', question: '12/2*3', tex: '12 \\div 2 \\times 3',
          goal: 'Work out <code>12 ÷ 2 × 3</code>. There are no brackets, so go from left to right.',
          how: [
            'The whole line halves 12, then triples what is left: × and ÷ are worked out in the order you read them, left to right.',
            '<code>12 ÷ 2</code> is first from the left: it is 6. Your next line is <code>6 × 3</code>.',
            '<code>× 3</code> then works on that 6, so the answer is 18.',
            'A common slip is <code>2 × 3</code> first: <code>12 ÷ 6</code> gives 2, which answers a different question.',
          ],
          explain: '× and ÷ have the same rank, so neither one goes first by rule: you take them from left to right, like reading a sentence.',
          hint: 'Start from the left. What is <code>12 ÷ 2</code>?',
          scene: divTimes,
          answer: '18', wrong: '2', lazy: '12/2*3', check: finalNumber(18) },
        { title: 'Plus and minus come last', kind: 'number', question: '10-4+2*3', tex: '10 - 4 + 2 \\times 3', scene: plusChain,
          goal: 'Work out <code>10 − 4 + 2 × 3</code>.',
          how: [
            'The whole line takes 4 from 10 and adds two threes: × and ÷ go before + and −, and then + and − go left to right.',
            '<code>2 × 3</code> goes first, even though it is at the end: it is 6. Next line: <code>10 − 4 + 6</code>.',
            '<code>10 − 4</code> is the first + or − from the left: it is 6. Next line: <code>6 + 6</code>.',
            '<code>6 + 6</code> is 12, your answer. Doing <code>4 + 6</code> before the minus would give 0, which is the wrong way round.',
          ],
          explain: 'That is the whole order: brackets, then × and ÷ left to right, then + and − left to right.',
          hint: 'Find the × and work it out first. Then go left to right through the − and the +.',
          answer: '12', wrong: '0', lazy: '10-4+2*3', check: finalNumber(12) },
        { title: 'The full chain', kind: 'number', question: '1*2-3*2+10/(2-1)', tex: '1 \\times 2 - 3 \\times 2 + 10 \\div (2 - 1)', work: 'required',
          goal: 'Work out <code>1 × 2 − 3 × 2 + 10 ÷ (2 − 1)</code>. This one checks your working: write at least one step before the answer, and every line has to be right, so a slip keeps the mission open until you fix that line or delete it.',
          how: [
            'This line uses every rule at once: brackets, then × and ÷, then + and −, each left to right.',
            '<code>(2 − 1)</code> first: it is 1, so the line becomes <code>1 × 2 − 3 × 2 + 10 ÷ 1</code>.',
            'Then each × and ÷ from the left: <code>1 × 2</code> is 2, <code>3 × 2</code> is 6 and <code>10 ÷ 1</code> is 10. Now it reads <code>2 − 6 + 10</code>.',
            'Last the − and +, left to right. <code>2 − 6</code> goes 4 below zero, which is written <code>−4</code> (type <code>-4</code>); then <code>−4 + 10</code> is 6.',
          ],
          explain: 'Each line of your working is checked against the question, not against the line above it, so one slip only marks that one line.',
          hint: 'Rewrite the line with the bracket worked out. Then rewrite it with every × and ÷ worked out. Each rewrite is one step.',
          steps: ['1*2-3*2+10/1', '2-6+10', '6'],
          scene: orderChain,
          answer: '6', wrong: '0', lazy: '1*2-3*2+10/(2-1)', check: finalNumber(6) },
        { title: 'When brackets change nothing', kind: 'scene',
          goal: 'Move the sliders until <code>a + b × c</code> and <code>(a + b) × c</code> give the same answer.',
          how: [
            'The scene works out the same three numbers two ways, once without brackets and once with them. The letters <code>a</code>, <code>b</code> and <code>c</code> stand for the numbers on the sliders.',
            '<code>a + b × c</code> multiplies only <code>b</code> by <code>c</code>, then adds <code>a</code>.',
            '<code>(a + b) × c</code> adds first, so <code>a</code> gets multiplied by <code>c</code> too.',
            'Press Play, or drag the step slider, to watch each row shrink one step at a time. Then change one slider at a time and compare the last chip of each row.',
          ],
          explain: 'The brackets decide whether <code>a</code> gets multiplied by <code>c</code> too. They stop mattering only when multiplying by <code>c</code> leaves a number as it was.',
          hint: 'Which slider can make <code>× c</code> do nothing at all?',
          answer: { a: 2, b: 3, c: 1 }, wrong: { a: 1, b: 2, c: 2 }, lazy: {},
          check: s => {
            const x = s.derived['a + b × c'], y = s.derived['(a + b) × c'];
            return x === y ? ok : { ok: false, why: `Not the same yet: ${x} and ${y}.` };
          } },
      ],
    }, {
      id: 'arithmetic.negatives', name: 'Negative numbers', badge: 'Cellar Lantern',
      story: 'Night at the cold cellar is below zero and the stalls owe coins, so you work out the cold and the debts to find the cellar lantern.',
      intro: 'The price card sends you down to the cold cellar, where the night is cold and the stalls owe Pim coins. A <b>negative number</b> is a number below zero, written with a minus sign in front: <code>−3</code> is 3 below zero. Picture a <b>number line</b>: 0 in the middle, the positive numbers to its right and the negative numbers to its left. Adding a positive number moves you right; taking one away moves you left. On a keyboard the minus sign is <code>-</code>, so type <code>-3</code> for <code>−3</code>.',
      scene: numberLine,
      missions: [
        { title: 'Below zero', kind: 'number', question: '-3-5', tex: '-3 - 5',
          goal: 'It is <code>−3</code> degrees at night in the cold cellar, and the temperature drops 5 more degrees. Work out <code>−3 − 5</code>.',
          how: [
            'The whole line starts 3 below zero and goes 5 further down. On the number line, that is a start at <code>−3</code> and 5 steps to the left.',
            '<code>−3</code> is the start: 3 steps left of 0.',
            '<code>− 5</code> takes away 5, so you move 5 more steps left: past −4, −5, −6 and −7, to −8.',
            'So the answer is <code>−8</code> (type <code>-8</code>). Going down from below zero takes you further below, not back toward zero.',
          ],
          explain: 'Adding a positive number moves right: <code>−3 + 5</code> is 2. Adding a negative number moves left: adding −5 and taking away 5 are the same move.',
          hint: 'Start at −3 on the number line and move 5 steps to the left.',
          at: { a: -3, b: -5 },
          answer: '-8', wrong: '8', lazy: '-3-5', check: finalNumber(-8) },
        { title: 'Minus times minus', kind: 'number', question: '-4*(-2)', tex: '-4 \\times (-2)',
          goal: 'Work out <code>−4 × (−2)</code>. The bracket keeps the two minus signs apart, so you can see each one.',
          how: [
            'The whole line multiplies two negative numbers. Multiplying with negatives works in two parts: first the size of the answer, then its sign, plus or minus.',
            'The size: leave out the signs and multiply <code>4 × 2</code>, which is 8.',
            'The sign: both numbers are negative, so they have the same sign, and the same signs give a positive answer.',
            'So <code>−4 × (−2)</code> is 8. One way to see it: <code>−4 × 2</code> is −8, and multiplying by −2 instead of 2 flips that to the other side of zero.',
          ],
          explain: 'The rule for × and ÷: the same signs give a positive answer, different signs give a negative one. <code>−4 × 2</code> is −8, and so is <code>4 × (−2)</code>.',
          hint: 'Multiply 4 by 2 first. Then ask: are the two signs the same, or different?',
          scene: product,
          answer: '8', wrong: '-8', lazy: '-4*(-2)', check: finalNumber(8) },
        { title: 'Sharing a debt', kind: 'number', question: '-12/3', tex: '-12 \\div 3',
          goal: 'Three stallholders owe Pim 12 coins between them, written <code>−12</code>, and split the debt equally. Work out <code>−12 ÷ 3</code>, each stallholder\'s share.',
          how: [
            'The whole line splits <code>−12</code> into 3 equal parts. Dividing follows the same sign rule as multiplying.',
            'The size: <code>12 ÷ 3</code> is 4.',
            'The sign: <code>−12</code> is negative and 3 is positive. Different signs give a negative answer.',
            'So each share is <code>−4</code>: each friend owes 4 coins. Check it: <code>−4 × 3</code> is −12.',
          ],
          explain: 'With the same signs the answer is positive: <code>−12 ÷ (−3)</code> is 4, because <code>4 × (−3)</code> is −12.',
          hint: 'Work out <code>12 ÷ 3</code>, then choose the sign: one number is negative and one is positive.',
          scene: debt,
          answer: '-4', wrong: '4', lazy: '-12/3', check: finalNumber(-4) },
        { title: 'A minus in front of brackets', kind: 'number', question: '8-(3-10)+(-2)*3', tex: '8 - (3 - 10) + (-2) \\times 3',
          goal: 'Work out <code>8 − (3 − 10) + (−2) × 3</code>. The order of operations still holds: brackets first, then ×, then + and − from left to right.',
          how: [
            'The whole line takes the bracket away from 8, then adds <code>(−2) × 3</code>. The minus in front of the bracket takes away everything inside it.',
            '<code>(3 − 10)</code> comes first: from 3, go 10 steps left, to −7. The line becomes <code>8 − (−7) + (−2) × 3</code>.',
            'Then the ×: <code>(−2) × 3</code> has different signs, so it is −6. Now the line reads <code>8 − (−7) + (−6)</code>.',
            'Taking away −7 is the same as adding 7, so <code>8 − (−7)</code> is 15. Adding −6 moves 6 left: <code>15 − 6</code> is 9.',
          ],
          explain: 'A common slip is to take away only the 3: <code>8 − 3 − 10 − 6</code> gives −11. The minus in front belongs to the whole bracket, so the −10 inside turns into +10.',
          hint: 'Work out <code>3 − 10</code> first. Then remember: taking away a negative number is the same as adding.',
          scene: negChain,
          answer: '9', wrong: '-11', lazy: '8-(3-10)+(-2)*3', check: finalNumber(9) },
        { title: 'Further left', kind: 'scene',
          goal: 'Move the sliders so the dot, at the end of the second arrow, lands on <code>−7</code>.',
          how: [
            'The scene works out <code>a + b</code> on a number line. The first arrow goes from 0 to <code>a</code>; the second starts there and moves by <code>b</code>.',
            'An arrow for a positive number points right, and an arrow for a negative number points left.',
            'The dot on the line marks where you end up, <code>a + b</code>.',
            'Each slider goes from −5 to 5, so neither arrow alone can reach −7. Change one slider at a time and watch the dot.',
          ],
          explain: 'With numbers no further than 5 from zero, one arrow cannot reach −7 on its own, so both arrows have to point left. Adding two negative numbers always gives a negative number.',
          hint: 'Which way must each arrow point to get that far left of 0?',
          answer: { a: -3, b: -4 }, wrong: { a: 3, b: -4 }, lazy: {},
          check: s => { const v = s.derived['a + b']; return v === -7 ? ok : no(`The dot is at ${signed(v)}, not −7 yet.`); } },
      ],
    }, {
      id: 'arithmetic.fractions', name: 'Fractions', badge: 'Whole Loaf',
      story: 'Pim\'s pie at the bakery stall is cut in unequal pieces, so you add, multiply and tidy the fractions to find the baker\'s whole loaf.',
      intro: 'By lantern light, the next chalk mark leads to the bakery stall, where Pim\'s pie is cut into pieces of different sizes. A <b>fraction</b> like <code>3/4</code> is part of a whole: cut the whole into 4 equal pieces and take 3 of them. The bottom number, the <b>denominator</b>, says how many pieces the whole is cut into. The top number, the <b>numerator</b>, says how many pieces you take. In this chapter your last line is a fraction: type <code>3/4</code> for three quarters.',
      scene: bars,
      missions: [
        { title: 'Pieces of the same size', kind: 'number', question: '1/4+1/3', tex: '\\frac{1}{4} + \\frac{1}{3}',
          goal: 'Work out <code>1/4 + 1/3</code>, a quarter of Pim\'s pie plus a third of one. Finish with one fraction.',
          how: [
            'The whole line adds a quarter and a third. You can only add pieces of the same size, so first cut both fractions into the same number of pieces.',
            '4 and 3 both fit into 12, so use twelfths. <code>1/4</code> is <code>3/12</code> (the bottom is 4 × 3, so the top is 1 × 3), and <code>1/3</code> is <code>4/12</code>.',
            'Now the pieces match: <code>3/12 + 4/12</code> is 7 twelfths. Add the tops; the bottom stays 12.',
            'Your last line is <code>7/12</code>. Adding tops and bottoms, <code>2/7</code>, gives less than <code>1/3</code> on its own, so it cannot be right.',
          ],
          explain: 'Taking away works the same way: <code>1/3 − 1/4</code> is <code>4/12 − 3/12</code>, which is <code>1/12</code>. A number that both bottom numbers divide into is a <b>common denominator</b>; the scene shows one.',
          hint: 'Write both fractions as twelfths. How many twelfths is <code>1/4</code>? And <code>1/3</code>?',
          at: { a: 4, b: 3 },
          answer: '7/12', wrong: '2/7', lazy: '1/4+1/3', check: finalFraction('7/12') },
        { title: 'Tops times tops', kind: 'number', question: '2/3*4/5', tex: '\\frac{2}{3} \\times \\frac{4}{5}',
          goal: 'Work out <code>2/3 × 4/5</code>.',
          how: [
            'The whole line takes two thirds of four fifths: "of" between fractions means ×. Multiplying needs no common denominator.',
            'Multiply the tops: <code>2 × 4</code> is 8. That is the new top.',
            'Multiply the bottoms: <code>3 × 5</code> is 15. That is the new bottom.',
            'So the answer is <code>8/15</code>. It is smaller than both fractions, because a part of a part is less than either.',
          ],
          explain: 'Adding needs a common denominator, multiplying does not: tops times tops, bottoms times bottoms.',
          hint: 'Multiply the two top numbers together, then the two bottom numbers.',
          scene: areaModel,
          answer: '8/15', wrong: '6/8', lazy: '2/3*4/5', check: finalFraction('8/15') },
        { title: 'Simplest form', kind: 'number', question: '18/24', tex: '\\frac{18}{24}',
          goal: 'Write <code>18/24</code> in its <b>simplest form</b>: the same amount, with the smallest whole numbers possible on top and bottom.',
          how: [
            'The whole line is one fraction that can be written with smaller numbers. Dividing the top and the bottom by the same number keeps the amount the same.',
            'Both 18 and 24 are even, so divide both by 2: <code>9/12</code>.',
            '9 and 12 are both in the 3 times table, so divide both by 3: <code>3/4</code>.',
            'No whole number above 1 divides both 3 and 4, so <code>3/4</code> is the simplest form. Dividing by 6 at once gets there in one step.',
          ],
          explain: 'From here on, a fraction answer counts only in its simplest form. When the quest says "not in its simplest form yet", look for a number that divides both the top and the bottom.',
          hint: 'Find a number that divides both 18 and 24. Divide the top and the bottom by it, and repeat.',
          scene: groups,
          answer: '3/4', wrong: '1/3', lazy: '18/24', check: finalFraction('3/4') },
        { title: 'The fraction chain', kind: 'number', question: '1/2+3/4*2/3-1/3', tex: '\\frac{1}{2} + \\frac{3}{4} \\times \\frac{2}{3} - \\frac{1}{3}', work: 'required',
          goal: 'Work out <code>1/2 + 3/4 × 2/3 − 1/3</code>, and finish with a fraction in its simplest form. This one checks your working: write at least one step before the answer, and every line has to be right.',
          how: [
            'The whole line mixes ×, + and − with fractions. The order of operations holds as always, so the × goes first.',
            '<code>3/4 × 2/3</code> is <code>6/12</code>, which simplifies to <code>1/2</code>. The line becomes <code>1/2 + 1/2 − 1/3</code>.',
            'Then left to right: <code>1/2 + 1/2</code> is 1, so the line is <code>1 − 1/3</code>.',
            'One whole is <code>3/3</code>, and <code>3/3 − 1/3</code> is <code>2/3</code>, your answer.',
          ],
          explain: 'Working out <code>1/2 + 3/4</code> before the × gives a different number. That answers a different question, because the order changed.',
          hint: 'Do the × first and simplify it. Then go from left to right.',
          steps: ['1/2+1/2-1/3', '1-1/3', '2/3'],
          scene: fracChain,
          answer: '2/3', wrong: '1/2', lazy: '1/2+3/4*2/3-1/3', check: finalFraction('2/3') },
        { title: 'A common denominator', kind: 'scene',
          goal: 'Set <code>a</code> to 4 and <code>b</code> to 6, so the bars show <code>1/4</code> and <code>1/6</code>. Then find the smallest number of pieces <code>n</code> where both coloured parts end exactly on a cut.',
          how: [
            'The scene shows two bars of the same length. The top bar has <code>1/a</code> coloured and the bottom bar <code>1/b</code>.',
            'The <code>n</code> slider cuts both bars into <code>n</code> equal pieces. When a coloured part ends exactly on a cut, it is a whole number of those pieces.',
            'When both coloured parts end on a cut, <code>n</code> is a common denominator: both fractions can be written with <code>n</code> on the bottom.',
            'The line under the scene says how many pieces each fraction covers, or that it ends inside a piece.',
          ],
          explain: 'Any number that both 4 and 6 divide into works, but the smallest one keeps the numbers small. It is called the <b>lowest common denominator</b>.',
          hint: 'Count in sixes: 6, 12, 18. Which of those can you also reach by counting in fours?',
          answer: { a: 4, b: 6, n: 12 }, wrong: { a: 4, b: 6, n: 24 }, lazy: {},
          check: s => {
            const { a, b, n } = s.params;
            if ([a, b].sort().join() !== '4,6') return no('Set the two bottom numbers, a and b, to 4 and 6 first.');
            if (n % 4 || n % 6) return no(`With ${n} pieces, 1/${n % 4 ? 4 : 6} ends inside a piece. Try a number that both 4 and 6 divide into.`);
            return n === 12 ? ok : no(`${n} pieces fit both, but a smaller number of pieces does too.`);
          } },
      ],
    }, {
      id: 'arithmetic.powers', name: 'Powers and roots', badge: 'Gold Tile',
      story: 'The tile-sellers lay tiles in squares and cubes, so you work out sides and powers to find the square of gold tiles.',
      intro: 'The loaf was wrapped in a note that points to the tile-sellers\' yard, where tiles are laid in neat squares and stacks. A <b>power</b> is a short way to write a number multiplied by itself: <code>2³</code> means <code>2 × 2 × 2</code>. The raised number is the <b>exponent</b>, and it counts how many copies are multiplied. Type <code>2^3</code> for <code>2³</code>. <code>n²</code> is said "n <b>squared</b>": it is the number of tiles in a square with <code>n</code> tiles on each side, as in the scene. A <b>square root</b>, <code>√</code>, goes the other way: <code>√9</code> is 3, because <code>3²</code> is 9. Type <code>sqrt(9)</code> for <code>√9</code>.',
      scene: tiles,
      missions: [
        { title: 'Copies multiplied', kind: 'number', question: '2^3', tex: '2^3',
          goal: 'Work out <code>2³</code>.',
          how: [
            '<code>2³</code> multiplies 2 by itself, with three 2s in all: <code>2 × 2 × 2</code>.',
            'The 2 at the bottom is the number being multiplied.',
            'The raised 3 counts the copies: <code>2 × 2</code> is 4, and <code>4 × 2</code> is 8.',
            'So <code>2³</code> is 8. A common slip is <code>2 × 3</code>, which is 6: the exponent counts copies, it is not a number to multiply by.',
          ],
          explain: 'You can write the copies out as your first step, <code>2*2*2</code>. The preview shows <code>2^3</code> with a raised 3.',
          hint: 'Write out three 2s with × between them, then multiply.',
          scene: cube,
          answer: '8', wrong: '6', lazy: '2^3', check: finalNumber(8) },
        { title: 'Where the minus belongs', kind: 'number', question: '-2^2+(-2)^2', tex: '-2^2 + (-2)^2',
          goal: 'Work out <code>−2² + (−2)²</code>. The two powers look alike, but they are different numbers.',
          how: [
            'The whole line adds two squares that differ only by a bracket. A power is worked out before the minus sign in front of it, unless a bracket says otherwise.',
            '<code>−2²</code> squares the 2 first, then puts the minus in front: <code>−(2 × 2)</code>, which is −4.',
            '<code>(−2)²</code> squares the whole bracket: <code>(−2) × (−2)</code>. The same signs give a positive answer, so it is 4.',
            'So the line is <code>−4 + 4</code>, which is 0.',
          ],
          explain: 'Powers come before × and ÷ in the order of operations: brackets, then powers, then × and ÷, then + and −. A minus in front of a number is a taking away, so it waits for the power.',
          hint: 'Work out each power on its own. Which one has the minus inside the bracket?',
          scene: squares,
          answer: '0', wrong: '8', lazy: '-2^2+(-2)^2', check: finalNumber(0) },
        { title: 'Back to the side', kind: 'number', question: 'sqrt(49)', tex: '\\sqrt{49}',
          goal: 'The tile-sellers lay a square of 49 tiles. How many tiles long is each side? Work out <code>√49</code>.',
          how: [
            '<code>√49</code> asks: which number, multiplied by itself, gives 49? It undoes squaring.',
            'Try a guess and square it: <code>6²</code> is 36, too small.',
            '<code>7²</code> is 49, so <code>√49</code> is 7.',
            'A square of 49 tiles is 7 tiles on each side. Halving 49 gives 24.5, which answers a different question.',
          ],
          explain: 'A negative number squared is positive too, so two numbers square to 49. But <code>√</code> always means the root that is zero or more.',
          hint: 'Which number times itself is 49? Try 6, then 7.',
          answer: '7', wrong: '24.5', lazy: 'sqrt(49)', check: finalNumber(7) },
        { title: 'Same base, add the exponents', kind: 'number', question: '3^2*3^3', tex: '3^2 \\times 3^3',
          goal: 'Work out <code>3² × 3³</code>.',
          how: [
            'The whole line multiplies two 3s by three more 3s. The number being copied, here 3, is called the <b>base</b>.',
            '<code>3²</code> is <code>3 × 3</code> and <code>3³</code> is <code>3 × 3 × 3</code>. Together that is five 3s multiplied: <code>3⁵</code> (type <code>3^5</code>).',
            'So with the same base, you add the exponents: 2 + 3 is 5.',
            '<code>3⁵</code> is <code>9 × 27</code>, which is 243. Multiplying the exponents gives <code>3⁶</code>, which is 729: one copy too many.',
          ],
          explain: 'Adding exponents works only when the base is the same: <code>2³ × 3²</code> is <code>8 × 9</code>, which is 72, and that is not a power of one number.',
          hint: 'Count the 3s: how many are multiplied together in all? Then work out that power.',
          scene: sameBase,
          answer: '243', wrong: '729', lazy: '3^2*3^3', check: finalNumber(243) },
        { title: 'A square of 64', kind: 'scene',
          goal: 'Move the <code>n</code> slider until the square has 64 tiles.',
          how: [
            'The scene builds a square <code>n</code> tiles wide and <code>n</code> tiles tall, so it has <code>n × n</code> tiles, which is <code>n²</code>.',
            'The <code>n</code> slider sets the side, and the line under the scene counts the tiles.',
            'Each step of <code>n</code> adds a whole row and a whole column, so the count grows faster and faster: 1, 4, 9, 16, 25.',
            'The <code>n</code> you find is <code>√64</code>.',
          ],
          explain: 'The tiles along one side are the square root of all the tiles: a side of <code>n</code> makes <code>n²</code> tiles. 64 is also <code>2⁶</code>: six 2s multiplied together.',
          hint: 'Which number times itself is 64?',
          answer: { n: 8 }, wrong: { n: 7 }, lazy: {},
          check: s => { const t = s.derived['n²']; return t === 64 ? ok : no(`That square has ${t} tiles, not 64 yet.`); } },
      ],
    }, {
      id: 'arithmetic.ratios', name: 'Ratios and percentages', badge: 'Lucky Purse',
      story: 'Wick and Dot argue over fair shares and sale prices, so you split stickers, take a discount and grow a price to find Pim\'s lucky purse.',
      intro: 'The gold tile shows the way to the sticker and jacket stalls, where Wick and Dot argue over every share and every price. A <b>ratio</b> compares amounts. If a recipe uses 2 cups of rice for every 3 cups of water, the ratio of rice to water is <code>2 : 3</code>, said "2 to 3". A <b>percentage</b> is a number out of 100: 25% (25 <b>percent</b>) means 25 out of every 100, the same as <code>25/100</code>. Both are fractions written another way, so what you did in Fractions works here too.',
      scene: ratioBar,
      missions: [
        { title: 'Same ratio, smaller numbers', kind: 'number', question: '12/18', tex: '12 : 18 \\;=\\; \\frac{12}{18}',
          goal: 'Two bakery stalls hold 12 and 18 loaves, a ratio of <code>12 : 18</code>. Write it as the fraction <code>12/18</code> in its simplest form.',
          how: [
            'A ratio simplifies like a fraction: divide both numbers by the same number, and the comparison stays the same.',
            '12 and 18 are both in the 6 times table: <code>12 ÷ 6</code> is 2 and <code>18 ÷ 6</code> is 3.',
            'So <code>12/18</code> is <code>2/3</code>, and the ratio <code>12 : 18</code> simplifies to <code>2 : 3</code>.',
            'For every 2 loaves at the first stall there are 3 at the second. Dividing by 2 first gives <code>6/9</code>; divide by 3 to finish.',
          ],
          explain: 'The simplified fraction compares the first stall\'s loaves to the second\'s. It is not the part of all the loaves that is at the first stall: that is 12 out of 30, or <code>2/5</code>.',
          hint: 'Find the biggest number that divides both 12 and 18.',
          at: { a: 12, b: 18 },
          answer: '2/3', wrong: '3/2', lazy: '12/18', check: finalFraction('2/3') },
        { title: 'Share in a ratio', kind: 'number', question: '35/(2+3)*3', tex: '35 \\text{ shared in the ratio } 2 : 3',
          goal: 'Wick and Pim share 35 stickers in the ratio <code>2 : 3</code>: Wick gets 2 for every 3 that Pim gets. How many stickers does Pim get?',
          how: [
            'The ratio cuts 35 into equal parts: Wick gets 2 parts and Pim gets 3.',
            'There are <code>2 + 3</code>, so 5, parts in all.',
            'One part is <code>35 ÷ 5</code>, which is 7 stickers.',
            'Pim has 3 parts: <code>3 × 7</code> is 21. Wick gets <code>2 × 7</code>, which is 14, and <code>21 + 14</code> makes 35 again.',
          ],
          explain: 'As one line, Pim\'s share is <code>35 ÷ (2 + 3) × 3</code>. Each step of your working is checked against it.',
          hint: 'How many parts are there in all? How many stickers make one part?',
          at: { a: 2, b: 3 },
          answer: '21', wrong: '14', lazy: '35/(2+3)*3', check: finalNumber(21) },
        { title: 'A percentage of an amount', kind: 'number', question: '80*15/100', tex: '15\\% \\text{ of } 80',
          goal: 'At the jacket stall, a jacket costs 80 coins, and there is 15% off. How many coins is 15% of 80?',
          how: [
            '15% of 80 means 15 out of every 100 of the 80. Find 1% first, then take 15 of them.',
            '1% is one hundredth: <code>80 ÷ 100</code> is 0.8.',
            '15% is 15 of those: <code>0.8 × 15</code> is 12.',
            'So 15% of 80 is 12 coins off. As one line: <code>80 × 15 ÷ 100</code>.',
          ],
          explain: 'Leaving out the ÷ 100 gives <code>80 × 15</code>, which is 1200: far more than the jacket costs. A percentage under 100 always gives less than the amount.',
          hint: 'What is 1% of 80? Then multiply that by 15.',
          scene: percent(false),
          answer: '12', wrong: '1200', lazy: '80*15/100', check: finalNumber(12) },
        { title: 'A percentage increase', kind: 'number', question: '40*(100+25)/100', tex: '40 \\text{ increased by } 25\\%',
          goal: 'Wick chalks a price of 40 coins, then raises it by 25%. What is the price now?',
          how: [
            'Raising by 25% means adding 25% of the price to the price itself.',
            '25% of 40 is <code>40 × 25 ÷ 100</code>, which is 10 coins.',
            'Add it on: <code>40 + 10</code> is 50 coins.',
            'In one step: the new price is 125% of the old one, and <code>40 × 125 ÷ 100</code> is 50 too.',
          ],
          explain: 'The 10 coins is only how much the price rose. The question asks for the new price, so the 40 coins it started with count too.',
          hint: 'Work out 25% of 40, then add it to 40.',
          scene: percent(true),
          answer: '50', wrong: '10', lazy: '40*(100+25)/100', check: finalNumber(50) },
        { title: 'Parts and percentages', kind: 'scene',
          goal: 'Move the sliders until part <code>a</code> is 40% of the bar.',
          how: [
            'The scene splits a bar in the ratio <code>a : b</code>: <code>a</code> parts in one colour, then <code>b</code> parts in another, all the same size.',
            'There are <code>a + b</code> parts in all, so part <code>a</code> is the fraction <code>a/(a + b)</code> of the bar.',
            'That fraction times 100 is a percentage, and the labels under the bar show it.',
            'Change one slider at a time and watch the percentage under each part.',
          ],
          explain: '40% is <code>40/100</code>, and a ratio <code>a : b</code> splits the bar into <code>a + b</code> parts. More than one ratio works, because ratios that simplify to the same one split the bar the same way.',
          hint: '40% is <code>40/100</code>. Simplify it: how many parts out of how many?',
          answer: { a: 2, b: 3 }, wrong: { a: 3, b: 2 }, lazy: {},
          check: s => { const { a, b } = s.params; return a * 100 === 40 * (a + b) ? ok : no(`Part a is ${s.derived['a %']}% of the bar now, not 40%.`); } },
      ],
    }],
    quickfire: [{
      ch: 0,
      make: r => {
        const n = () => 1 + Math.floor(r() * 9), op = () => ['+', '-', '*'][Math.floor(r() * 3)];
        const f = (x, o, y) => (o === '+' ? x + y : o === '-' ? x - y : x * y);
        const sym = o => ({ '+': '+', '-': '−', '*': '×' }[o]);
        for (;;) {
          const a = n(), b = n(), c = n(), o1 = op(), o2 = op();
          const show = `${a} ${sym(o1)} ${b} ${sym(o2)} ${c}`, q = `${a}${o1}${b}${o2}${c}`;
          // Negative numbers are only met in passing in this chapter, so quick-fire keeps every step at zero or above.
          if (o2 === '*' && o1 !== '*') {
            const bc = b * c, ans = f(a, o1, bc);
            if (ans >= 0) return { q, show, a: ans, why: `${b} × ${c} = ${bc} comes first, then ${a} ${sym(o1)} ${bc} = ${ans}.` };
          } else {
            const ab = f(a, o1, b), ans = f(ab, o2, c);
            if (ab >= 0 && ans >= 0) return { q, show, a: ans, why: `${o1 === '*' ? '' : 'Left to right: '}${a} ${sym(o1)} ${b} = ${ab}${o1 === '*' ? ' comes first' : ''}, then ${ab} ${sym(o2)} ${c} = ${ans}.` };
          }
        }
      },
    }, {
      ch: 1,
      make: r => {
        const pick = () => (1 + Math.floor(r() * 9)) * (r() < 0.5 ? -1 : 1);
        const o = ['+', '-', '*', '/'][Math.floor(r() * 4)], b = pick();
        // A ÷ question starts from a multiple of b, so every answer is a whole number.
        const a = o === '/' ? pick() * b : pick();
        const ans = o === '+' ? a + b : o === '-' ? a - b : o === '*' ? a * b : a / b;
        const sym = { '+': '+', '-': '−', '*': '×', '/': '÷' }[o], bs = b < 0 ? `(${signed(b)})` : String(b);
        const why = o === '+' ? `Adding ${signed(b)} moves ${Math.abs(b)} to the ${b < 0 ? 'left' : 'right'}: ${signed(a)} + ${bs} = ${signed(ans)}.`
          : o === '-' ? (b < 0 ? `Taking away ${signed(b)} is the same as adding ${-b}: ${signed(a)} + ${-b} = ${signed(ans)}.` : `Taking away ${b} moves ${b} to the left: ${signed(a)} − ${b} = ${signed(ans)}.`)
          : `${Math.abs(a)} ${sym} ${Math.abs(b)} = ${Math.abs(ans)}, and the signs are ${(a < 0) === (b < 0) ? 'the same, so the answer is positive' : 'different, so the answer is negative'}: ${signed(ans)}.`;
        return { q: `${a}${o}(${b})`, show: `${signed(a)} ${sym} ${bs}`, a: ans, why };
      },
    }, {
      ch: 2,
      make: r => {
        const b = 2 + Math.floor(r() * 5), a = 1 + Math.floor(r() * (b - 1)), k = 2 + Math.floor(r() * 4);
        const t = r();
        if (t < 1 / 3) {
          const c = 1 + Math.floor(r() * (b - 1)), g = gcd(a + c, b), top = (a + c) / g, bot = b / g;
          return { q: `${a}/${b}+${c}/${b}`, show: `${a}/${b} + ${c}/${b}`, a: bot === 1 ? top : `${top}/${bot}`,
            why: `Same bottom, so add the tops: ${a + c}/${b}${g > 1 ? `, and dividing top and bottom by ${g} gives ${bot === 1 ? top : `${top}/${bot}`}` : ''}.` };
        }
        if (t < 2 / 3) return { q: `${a}/${b}*${b * k}`, show: `${a}/${b} = ?/${b * k}`, a: a * k, why: `${b} × ${k} = ${b * k}, so the top is ${a} × ${k} = ${a * k}.` };
        const n = b * k;
        return { q: `${a}/${b}*${n}`, show: `${a}/${b} of ${n}`, a: a * k, why: `1/${b} of ${n} is ${n} ÷ ${b} = ${k}, so ${a}/${b} of ${n} is ${a} × ${k} = ${a * k}.` };
      },
    }, {
      ch: 3,
      make: r => {
        const t = Math.floor(r() * 4), n = 2 + Math.floor(r() * 8);
        if (t === 0) return { q: `${n}^2`, show: `${n}²`, a: n * n, why: `${n}² = ${n} × ${n} = ${n * n}.` };
        if (t === 1) { const c = 2 + Math.floor(r() * 4); return { q: `${c}^3`, show: `${c}³`, a: c ** 3, why: `${c}³ = ${c} × ${c} × ${c} = ${c ** 3}.` }; }
        if (t === 2) return { q: `sqrt(${n * n})`, show: `√${n * n}`, a: n, why: `${n} × ${n} = ${n * n}, so √${n * n} = ${n}.` };
        const c = 2 + Math.floor(r() * 4);
        return r() < 0.5
          ? { q: `(-${c})^2`, show: `(−${c})²`, a: c * c, why: `The bracket is squared: (−${c}) × (−${c}) = ${c * c}, same signs give a positive answer.` }
          : { q: `-${c}^2`, show: `−${c}²`, a: -c * c, why: `The power goes first: ${c}² = ${c * c}, then the minus in front makes it −${c * c}.` };
      },
    }, {
      ch: 4,
      make: r => {
        if (r() < 0.5) {
          const p = [5, 10, 20, 25, 50, 75][Math.floor(r() * 6)], n = 20 * (1 + Math.floor(r() * 10));
          return { q: `${n}*${p}/100`, show: `${p}% of ${n}`, a: n * p / 100, why: `${n} × ${p} ÷ 100 = ${n * p / 100}.` };
        }
        const x = 1 + Math.floor(r() * 4), y = x + 1 + Math.floor(r() * 3), k = 2 + Math.floor(r() * 8), n = k * (x + y);
        return { q: `${n}/(${x}+${y})*${y}`, show: `Share ${n} in the ratio ${x} : ${y}. The bigger share?`, a: k * y, why: `${x} + ${y} = ${x + y} parts, one part is ${n} ÷ ${x + y} = ${k}, and ${y} parts are ${k * y}.` };
      },
    }],
    guide: [
      { ch: 0, title: 'The order of operations',
        what: 'Work out a line in this order: 1. brackets; 2. × and ÷, left to right; 3. + and −, left to right.',
        tex: '(6 + 4) \\times 3 = 30 \\qquad 6 + 4 \\times 3 = 18', scene: true },
      { ch: 0, title: 'Why 10 ÷ (2 − 1) is not 10 ÷ 2 − 1',
        what: 'The bracket makes <code>2 − 1</code> happen first, so 10 is divided by 1 and the answer is 10. Without the bracket, ÷ goes first: <code>10 ÷ 2</code> is 5, then <code>5 − 1</code> is 4.',
        tex: '10 \\div (2 - 1) = 10 \\qquad 10 \\div 2 - 1 = 4' },
      { ch: 1, title: 'Adding and taking away negatives',
        what: 'On the number line, adding a positive number moves right and adding a negative number moves left. Taking away a negative number is the same as adding the positive one: <code>8 − (−7)</code> is <code>8 + 7</code>.',
        tex: '-3 - 5 = -8 \\qquad 8 - (-7) = 15', scene: true },
      { ch: 1, title: 'Signs when you multiply or divide',
        what: 'Work out the size first, then the sign. Two numbers with the same sign give a positive answer; different signs give a negative one.',
        tex: '-4 \\times (-2) = 8 \\qquad -12 \\div 3 = -4' },
      { ch: 2, title: 'Adding fractions',
        what: 'Write both fractions with the same bottom number, a common denominator, then add the tops. The bottom stays the same.',
        tex: '\\frac{1}{4} + \\frac{1}{3} = \\frac{3}{12} + \\frac{4}{12} = \\frac{7}{12}', scene: true },
      { ch: 2, title: 'Multiplying and simplifying',
        what: 'To multiply, multiply the tops and multiply the bottoms. To simplify, divide the top and the bottom by the same number until no whole number above 1 divides both.',
        tex: '\\frac{2}{3} \\times \\frac{4}{5} = \\frac{8}{15} \\qquad \\frac{18}{24} = \\frac{9}{12} = \\frac{3}{4}' },
      { ch: 3, title: 'Powers and square roots',
        what: 'The exponent counts how many copies of the base are multiplied. A square root undoes squaring: <code>√49</code> is the number that, times itself, gives 49.',
        tex: '2^3 = 2 \\times 2 \\times 2 = 8 \\qquad \\sqrt{49} = 7', scene: true },
      { ch: 3, title: 'Powers with the same base',
        what: 'Multiplying powers of the same base adds the exponents. Watch the minus sign: <code>−2²</code> is −4, but <code>(−2)²</code> is 4.',
        tex: '3^2 \\times 3^3 = 3^5 = 243 \\qquad -2^2 = -4 \\qquad (-2)^2 = 4' },
      { ch: 4, title: 'Sharing in a ratio',
        what: 'Add the numbers of the ratio to find how many parts there are. Divide the amount by that to find one part, then multiply by each share.',
        tex: '35 \\text{ in } 2 : 3 \\colon\\; 35 \\div 5 = 7, \\quad 2 \\times 7 = 14, \\quad 3 \\times 7 = 21', scene: true },
      { ch: 4, title: 'Percent means out of 100',
        what: 'To find a percentage of an amount, multiply by the percentage and divide by 100. To increase by a percentage, add that much on, or multiply by 100 plus the percentage, then divide by 100.',
        tex: '15\\% \\text{ of } 80 = 80 \\times 15 \\div 100 = 12 \\qquad 40 \\times 125 \\div 100 = 50' },
    ],
  };
})();
