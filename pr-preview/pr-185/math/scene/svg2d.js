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

  // Stroke paths on a 24-unit grid; add a name here only when a story picture uses it.
  S.icons = {
    snowflake: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5',
    sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
    coin: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9',
    board: 'M3 4h18v12H3zM7 8h6M7 12h10M8 20l2-4M16 20l-2-4',
    loaf: 'M3 15c0-5 4-8 9-8s9 3 9 8v2H3zM8 11l1.5 3M12 10l1.5 3M16 11l1.5 3',
  };

  S.draw = (svg, def, state, colorOf, set) => {
    const [x0, x1, y0, y1] = def.view, [W, H] = def.box || [400, 300];
    const X = x => (x - x0) / (x1 - x0) * W, Y = y => H - (y - y0) / (y1 - y0) * H;
    const focused = document.activeElement && svg.contains(document.activeElement) ? document.activeElement.getAttribute('data-id') : null;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.replaceChildren();
    // Optional style on every shape: `color` fills (and strokes), `edge` strokes, `w` stroke width, `dash` a dash pattern.
    const dress = (e, it) => {
      if (it.color) { e.style.fill = it.color; if (it.stroke !== false) e.style.stroke = it.edge || it.color; } else if (it.edge && it.stroke !== false) e.style.stroke = it.edge;
      if (it.w) e.style.strokeWidth = it.w;
      if (it.dash) e.setAttribute('stroke-dasharray', it.dash);
      return e;
    };
    const solid = (e, it) => {
      paint(e, it.term, 'stroke');
      e.setAttribute('fill', it.term ? colorOf(it.term) : 'currentColor');
      if (it.stroke === false) e.setAttribute('stroke', 'none');
      return dress(e, it);
    };
    const paint = (e, term, attr) => { if (term) e.setAttribute('data-term', term); e.setAttribute(attr, term ? colorOf(term) : 'currentColor'); return e; };

    def.items(state).forEach((it, i) => {
      if (it.type === 'axes') {
        const g = el('g', { class: 'axes' }, svg);
        el('line', { x1: 0, x2: W, y1: Y(0), y2: Y(0) }, g);
        el('line', { x1: X(0), x2: X(0), y1: 0, y2: H }, g);
        if (it.xTicks !== false) for (let v = Math.floor(x0) + 1; v < x1; v++) if (v) el('text', { x: X(v), y: Math.min(H - 2, Y(0) + 12), 'text-anchor': 'middle' }, g).textContent = tick(v);
        for (let v = Math.floor(y0) + 1; v < y1; v++) if (v) el('text', { x: Math.max(12, X(0) - 4), y: Y(v) + 4, 'text-anchor': 'end' }, g).textContent = tick(v);
      } else if (it.type === 'fn') {
        for (const seg of S.sample(it.f, x0, x1)) paint(el('polyline', { class: 'shape fn', fill: 'none', points: seg.map(q => `${X(q[0])},${Y(q[1])}`).join(' ') }, svg), it.term, 'stroke');
      } else if (it.type === 'polygon') {
        solid(el('polygon', { class: 'shape', 'fill-opacity': it.alpha ?? '.25', 'stroke-width': 2, points: it.pts.map(q => `${X(q[0])},${Y(q[1])}`).join(' ') }, svg), it);
      } else if (it.type === 'rrect') {
        solid(el('rect', { class: 'shape', 'fill-opacity': it.alpha ?? '.25', 'stroke-width': 2, x: X(it.x0), y: Y(it.y1), width: X(it.x1) - X(it.x0), height: Y(it.y0) - Y(it.y1), rx: it.r || 0 }, svg), it);
      } else if (it.type === 'circle') {
        solid(el('ellipse', { class: 'shape', 'fill-opacity': it.alpha ?? '.25', 'stroke-width': 2, cx: X(it.x), cy: Y(it.y), rx: it.r, ry: it.ry || it.r }, svg), it);
      } else if (it.type === 'text') {
        const t = el('text', { class: 'label' + (it.small ? ' small' : ''), x: X(it.x), y: Y(it.y), 'text-anchor': it.anchor || 'middle', 'dominant-baseline': 'central', 'data-term': it.term }, svg);
        t.textContent = it.s;
        if (it.color) t.style.fill = it.color;
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
        // drag.angle: the param is the point's direction in degrees from drag.about, counter-clockwise from the +x axis.
        const ang = it.drag.angle, [ox, oy] = it.drag.about || [0, 0];
        c.setAttribute('aria-valuetext', ang ? `${state.params[ang]}°` : `(${+it.x.toFixed(2)}, ${+it.y.toFixed(2)})`);
        const move = (dx, dy) => { if (it.drag.x) set(it.drag.x, state.params[it.drag.x] + dx); if (it.drag.y) set(it.drag.y, state.params[it.drag.y] + dy); };
        c.addEventListener('keydown', e => {
          const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
          if (!d) return;
          e.preventDefault();
          if (ang) set(ang, state.params[ang] + (d[1] || -d[0]) * (it.drag.step || 1));
          else move(d[0] * (it.drag.stepX || 1), d[1] * (it.drag.stepY || 1));
        });
        c.addEventListener('pointerdown', e => {
          svg.setPointerCapture(e.pointerId);
          const r = svg.getBoundingClientRect();
          const at = ev => [x0 + (ev.clientX - r.left) / r.width * (x1 - x0), y1 - (ev.clientY - r.top) / r.height * (y1 - y0)];
          const drag = ev => {
            const q = at(ev);
            // -90..-180 (below the line, left side) counts as past 180, so a ray pulled under the left end stays there
            if (ang) { const a = Math.atan2(q[1] - oy, q[0] - ox) * 180 / Math.PI; set(ang, a < -90 ? a + 360 : a); return; }
            if (it.drag.x) set(it.drag.x, q[0]);
            if (it.drag.y) set(it.drag.y, q[1]);
          };
          svg.addEventListener('pointermove', drag);
          const up = () => { svg.removeEventListener('pointermove', drag); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up); };
          svg.addEventListener('pointerup', up);
          svg.addEventListener('pointercancel', up);
        });
      } else if (it.type === 'icon') {
        const k = (it.size || 22) / 24;
        const ic = paint(el('path', { class: 'shape icon', d: S.icons[it.name], fill: 'none', 'stroke-width': 2 / k, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', transform: `translate(${X(it.x) - 12 * k} ${Y(it.y) - 12 * k}) scale(${k})` }, svg), it.term, 'stroke');
        if (it.color) ic.style.stroke = it.color;
      } else if (it.type === 'grid') {
        const g = el('g', { class: 'grid' }, svg);
        for (let v = Math.ceil(x0); v <= x1; v++) el('line', { x1: X(v), x2: X(v), y1: 0, y2: H }, g);
        for (let v = Math.ceil(y0); v <= y1; v++) el('line', { x1: 0, x2: W, y1: Y(v), y2: Y(v) }, g);
      }
    });
    if (focused) { const f = svg.querySelector(`[data-id="${focused}"]`); if (f) f.focus(); }
  };
})();
