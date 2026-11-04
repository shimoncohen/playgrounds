(() => {
  const G = MQ.graph, NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    e.append(...kids);
    return e;
  };
  const svg = (tag, attrs = {}, ...kids) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    e.append(...kids);
    return e;
  };
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };

  const states = {};
  for (const t of G.tracks) states[t.id] = read(t.key);
  const done = G.doneFrom(states);
  const href = id => `${G.trackOf(id)}/#ch=${id}`;
  const name = id => G.tracks.find(t => t.id === id).name;
  let selected = null;

  function ring(n, total) {
    const r = 26, c = 2 * Math.PI * r;
    return svg('svg', { class: 'ring', viewBox: '0 0 64 64', 'aria-hidden': 'true' },
      svg('circle', { class: 'bg', cx: 32, cy: 32, r }),
      ...(n ? [svg('circle', { class: 'fg', cx: 32, cy: 32, r, 'stroke-dasharray': `${c * n / total} ${c}` })] : []),
      svg('text', { x: 32, y: 32 }, `${n}/${total}`));
  }

  function renderTracks() {
    $('tracks').replaceChildren(...G.tracks.map(t => {
      const cs = G.chapters[t.id], n = cs.filter(c => done.has(c.id)).length;
      const show = el('button', { type: 'button', class: 'btn', 'aria-pressed': String(selected === t.id) }, 'Chapter map');
      show.onclick = () => select(t.id);
      return el('div', { class: 'tcard' }, ring(n, cs.length),
        el('div', {}, el('h3', {}, t.name), el('div', { class: 'count' }, `${n} of ${cs.length} chapters done`),
          el('div', { class: 'acts' }, el('a', { class: 'btn primary', href: `${t.id}/` }, n ? 'Continue' : 'Start'), show)));
    }));
  }

  function renderNext() {
    const ids = G.nextUp(done);
    $('next').replaceChildren(...(ids.length ? ids.map(id =>
      el('li', {}, el('a', { href: href(id) }, G.chapter(id).title, el('small', {}, name(G.trackOf(id)))))) :
      [el('li', { class: 'empty' }, 'Everything available is done.')]));
  }

  const W = 190, H = 44, GX = 60, GY = 20, PAD = 12;
  const node = (x, y, label, cls, to, onclick) => {
    const lines = G.labelLines(label, 22);
    const g = svg('g', { class: 'node ' + cls, transform: `translate(${x} ${y})` },
      svg('title', {}, label), svg('rect', { width: W, height: H, rx: 10 }),
      svg('text', { x: W / 2, y: H / 2 - (lines.length - 1) * 8 }, ...lines.map((l, i) => svg('tspan', { x: W / 2, dy: i ? 16 : 0 }, l))));
    if (to) g.onclick = () => { location.href = to; };
    if (onclick) g.onclick = onclick;
    return g;
  };
  const edge = (a, b) => svg('path', { class: 'edge', 'marker-end': 'url(#arr)',
    d: `M${a.x + W} ${a.y + H / 2} C${a.x + W + GX / 2} ${a.y + H / 2} ${b.x - GX / 2} ${b.y + H / 2} ${b.x - 4} ${b.y + H / 2}` });
  const canvas = (w, h, label, ...kids) => svg('svg', { class: 'map', viewBox: `0 0 ${w} ${h}`, style: `max-width:${w}px`, role: 'img', 'aria-label': label },
    svg('defs', {}, svg('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto' },
      svg('path', { d: 'M0 0L10 5L0 10z' }))), ...kids);

  function renderOverview() {
    const pos = {}, { cols, links } = G.trackMap(), rows = Math.max(...cols.map(c => c.length));
    cols.forEach((ids, ci) => ids.forEach((id, ri) => { pos[id] = { x: PAD + ci * (W + GX), y: PAD + ri * (H + GY) }; }));
    const edges = G.trackEdges();
    $('overview').replaceChildren(canvas(PAD * 2 + cols.length * W + (cols.length - 1) * GX, PAD * 2 + rows * H + (rows - 1) * GY,
      `Track overview: ${G.tracks.map(t => t.name).join(', ')}. ` + edges.map(([a, b]) => `${name(a)} comes before ${name(b)}.`).join(' '),
      ...links.map(([a, b]) => edge(pos[a], pos[b])),
      ...G.tracks.map(t => node(pos[t.id].x, pos[t.id].y, t.name, selected === t.id ? 'sel' : '', null, () => select(t.id)))));
  }

  function layout(trackId) {
    const layers = G.layers(trackId), own = new Set(layers.flat());
    const outside = [...new Set(layers.flat().flatMap(id => G.chapter(id).requires).filter(r => !own.has(r)))];
    const cols = (outside.length ? [outside] : []).concat(layers), pos = {};
    cols.forEach((ids, ci) => ids.forEach((id, ri) => { pos[id] = { x: PAD + ci * (W + GX), y: PAD + ri * (H + GY) }; }));
    return { cols, pos, own };
  }

  function renderTrackView() {
    const host = $('trackView');
    if (!selected) { host.replaceChildren(); return; }
    const { cols, pos, own } = layout(selected);
    const rows = Math.max(...cols.map(c => c.length));
    const ids = cols.flat();
    const edges = ids.flatMap(id => G.chapter(id).requires.filter(r => pos[r] && own.has(id)).map(r => edge(pos[r], pos[id])));
    const nodes = ids.map(id => node(pos[id].x, pos[id].y, G.chapter(id).title,
      (done.has(id) ? 'done' : '') + (own.has(id) ? '' : ' faded'), href(id)));
    host.replaceChildren(
      el('div', { class: 'tv-head' }, el('h3', {}, name(selected)), el('a', { class: 'btn', href: `${selected}/` }, 'Open track')),
      canvas(PAD * 2 + cols.length * W + (cols.length - 1) * GX, PAD * 2 + rows * H + (rows - 1) * GY,
        `${name(selected)} chapters by prerequisite order. The same list follows below.`, ...edges, ...nodes));
  }

  function renderList() {
    const tick = id => done.has(id) ? [el('span', { class: 'tick' }, ' (done)')] : [];
    $('mapList').replaceChildren(...G.tracks.flatMap(t => [el('h3', {}, t.name),
      el('ol', {}, ...G.layers(t.id).flat().map(id => {
        const outside = G.chapter(id).requires.filter(r => G.trackOf(r) !== t.id);
        return el('li', {}, el('a', { href: href(id) }, G.chapter(id).title), ...tick(id),
          ...(outside.length ? [el('div', { class: 'needs' }, 'Needs first: ', ...outside.flatMap((r, k) =>
            [...(k ? [', '] : []), el('a', { href: href(r) }, G.chapter(r).title), ` (${name(G.trackOf(r))})`, ...tick(r)]))] : []));
      }))]));
  }

  function select(id) {
    selected = selected === id ? null : id;
    renderTracks();
    renderOverview();
    renderTrackView();
  }

  renderTracks();
  renderNext();
  renderOverview();
  renderTrackView();
  renderList();
})();
