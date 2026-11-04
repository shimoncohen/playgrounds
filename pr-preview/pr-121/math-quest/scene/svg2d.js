(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};
  const S = MQ.svg2d = {};
  const NS = 'http://www.w3.org/2000/svg';

  // Splits at non-finite values and at a sign flip with a jump over half the range, so 1/x gets no vertical line.
  // shortcut: needs n >= ~50 to see the jump, raise n for a function that is steeper than 1/x.
  S.sample = (f, x0, x1, n = 200) => {
    const pts = [];
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; pts.push([x, f(x)]); }
    const ys = pts.map(q => q[1]).filter(Number.isFinite);
    const range = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
    const segs = [];
    let cur = [], prev = null;
    for (const q of pts) {
      if (!Number.isFinite(q[1])) { if (cur.length) segs.push(cur); cur = []; prev = null; continue; }
      if (prev && Math.sign(prev[1]) * Math.sign(q[1]) < 0 && Math.abs(q[1] - prev[1]) > range / 2) { segs.push(cur); cur = []; }
      cur.push(q); prev = q;
    }
    if (cur.length) segs.push(cur);
    return segs.filter(s => s.length > 1);
  };

  const tick = v => (v < 0 ? '\u2212' + -v : String(v));

  const el = (name, attrs, parent) => {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  S.draw = (svg, def, state, colorOf, set) => {
    const [x0, x1, y0, y1] = def.view, [W, H] = def.box || [400, 300];
    const X = x => (x - x0) / (x1 - x0) * W, Y = y => H - (y - y0) / (y1 - y0) * H;
    const focused = document.activeElement && svg.contains(document.activeElement) ? document.activeElement.getAttribute('data-id') : null;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.replaceChildren();
    const paint = (e, term, attr) => { if (term) e.setAttribute('data-term', term); e.setAttribute(attr, term ? colorOf(term) : 'currentColor'); return e; };

    def.items(state).forEach((it, i) => {
      if (it.type === 'axes') {
        const g = el('g', { class: 'axes' }, svg);
        el('line', { x1: 0, x2: W, y1: Y(0), y2: Y(0) }, g);
        el('line', { x1: X(0), x2: X(0), y1: 0, y2: H }, g);
        for (let v = Math.floor(x0) + 1; v < x1; v++) if (v) el('text', { x: X(v), y: Math.min(H - 2, Y(0) + 12), 'text-anchor': 'middle' }, g).textContent = tick(v);
        for (let v = Math.floor(y0) + 1; v < y1; v++) if (v) el('text', { x: Math.max(12, X(0) - 4), y: Y(v) + 4, 'text-anchor': 'end' }, g).textContent = tick(v);
      } else if (it.type === 'fn') {
        for (const seg of S.sample(it.f, x0, x1)) paint(el('polyline', { class: 'shape fn', fill: 'none', points: seg.map(q => `${X(q[0])},${Y(q[1])}`).join(' ') }, svg), it.term, 'stroke');
      } else if (it.type === 'polygon') {
        paint(el('polygon', { class: 'shape', 'fill-opacity': '.25', 'stroke-width': 2, points: it.pts.map(q => `${X(q[0])},${Y(q[1])}`).join(' ') }, svg), it.term, 'stroke').setAttribute('fill', it.term ? colorOf(it.term) : 'currentColor');
      } else if (it.type === 'text') {
        el('text', { class: 'label' + (it.small ? ' small' : ''), x: X(it.x), y: Y(it.y), 'text-anchor': it.anchor || 'middle', 'dominant-baseline': 'central', 'data-term': it.term }, svg).textContent = it.s;
      } else if (it.type === 'vector') {
        const [a, b] = [it.from, it.to], ang = Math.atan2(Y(b[1]) - Y(a[1]), X(b[0]) - X(a[0])), h = 9;
        const tip = [X(b[0]), Y(b[1])];
        const head = [-0.4, 0.4].map(d => `${tip[0] - h * Math.cos(ang + d)},${tip[1] - h * Math.sin(ang + d)}`);
        const g = paint(el('g', { class: 'shape vec', 'stroke-width': 2.5 }, svg), it.term, 'stroke');
        el('line', { x1: X(a[0]), y1: Y(a[1]), x2: tip[0], y2: tip[1] }, g);
        el('polyline', { points: `${head[0]} ${tip} ${head[1]}`, fill: 'none' }, g);
      } else if (it.type === 'point') {
        const c = paint(el('circle', { class: 'shape pt' + (it.drag ? ' drag' : ''), cx: X(it.x), cy: Y(it.y), r: it.drag ? 8 : 5 }, svg), it.term, 'fill');
        if (!it.drag) return;
        const id = 'pt' + i;
        c.setAttribute('data-id', id);
        c.setAttribute('tabindex', '0');
        c.setAttribute('role', 'slider');
        c.setAttribute('aria-label', it.label || 'point');
        c.setAttribute('aria-valuetext', `(${+it.x.toFixed(2)}, ${+it.y.toFixed(2)})`);
        const move = (dx, dy) => { if (it.drag.x) set(it.drag.x, state.params[it.drag.x] + dx); if (it.drag.y) set(it.drag.y, state.params[it.drag.y] + dy); };
        c.addEventListener('keydown', e => {
          const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
          if (!d) return;
          e.preventDefault();
          move(d[0] * (it.drag.stepX || 1), d[1] * (it.drag.stepY || 1));
        });
        c.addEventListener('pointerdown', e => {
          svg.setPointerCapture(e.pointerId);
          const r = svg.getBoundingClientRect();
          const at = ev => [x0 + (ev.clientX - r.left) / r.width * (x1 - x0), y1 - (ev.clientY - r.top) / r.height * (y1 - y0)];
          const drag = ev => { const q = at(ev); if (it.drag.x) set(it.drag.x, q[0]); if (it.drag.y) set(it.drag.y, q[1]); };
          svg.addEventListener('pointermove', drag);
          const up = () => { svg.removeEventListener('pointermove', drag); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up); };
          svg.addEventListener('pointerup', up);
          svg.addEventListener('pointercancel', up);
        });
      }
    });
    if (focused) { const f = svg.querySelector(`[data-id="${focused}"]`); if (f) f.focus(); }
  };
})();
