(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};
  MQ.scene = MQ.scene || {};
  let uid = 0;
  const SPEEDS = [0.25, 0.5, 1, 1.5, 2];
  // ×1 plays at 60% of a scene's own `t.speed`: learners found the authored speeds too quick to follow.
  const BASE_RATE = 0.6;
  // Same key and shape as input/work.js (`{ input, speed }`): merge, never overwrite the other field.
  const PREFS = 'math-prefs-v1';
  const prefs = () => { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch (e) { return {}; } };
  const savePrefs = patch => { try { localStorage.setItem(PREFS, JSON.stringify(Object.assign(prefs(), patch))); } catch (e) { /* storage blocked: keep the choice for this visit */ } };

  const h = (tag, cls, parent, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };

  MQ.scene.mount = (el, def, { onChange } = {}) => {
    const model = MQ.scene.model(def), id = 'mqs' + ++uid;
    const colorOf = model.colorOf;
    const is3d = def.draw.kind === '3d';
    el.classList.add('mq-scene');
    el.replaceChildren();

    const formula = h('div', 'mq-formula', el);
    if (window.katex) {
      katex.render(def.formula, formula, { macros: { '\\term': '\\htmlData{term=#1}{#2}' }, trust: c => c.command === '\\htmlData', strict: 'ignore', throwOnError: false });
      formula.querySelectorAll('[data-term]').forEach(n => { n.style.color = colorOf(n.dataset.term); });
    } else formula.textContent = def.formula;

    const stage = h('div', 'mq-stage', el);
    const svg = is3d ? null : document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (svg) { svg.setAttribute('class', 'mq-svg'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', def.title || 'graph'); stage.appendChild(svg); }

    const controls = h('div', 'mq-params', el);
    const inputs = {};
    const row = (name, spec, term) => {
      const r = h('div', 'mq-p', controls);
      if (term) r.style.setProperty('--tc', colorOf(name));
      const lab = h('label', 'mq-lab', r);
      lab.htmlFor = `${id}-${name}-r`;
      if (term) { lab.setAttribute('data-term', name); h('span', 'sw', lab).style.background = colorOf(name); }
      lab.append(spec.label);
      const range = h('input', null, r), numIn = h('input', 'mq-n', r);
      for (const [i, kind] of [[range, 'range'], [numIn, 'number']]) {
        i.type = kind; i.min = spec.min; i.max = spec.max; i.step = spec.step || 1;
        if (term) i.setAttribute('data-term', name);
        i.addEventListener('input', () => { model.set(name, i.value); update(); });
      }
      range.id = `${id}-${name}-r`;
      numIn.setAttribute('aria-label', `${spec.label} value`);
      inputs[name] = [range, numIn];
    };
    for (const n of Object.keys(def.params)) row(n, def.params[n], true);

    let playing = false, visible = true, last = 0, raf = 0, playBtn, speed = SPEEDS.includes(prefs().speed) ? prefs().speed : 1;
    if (def.t) {
      const bar = h('div', 'mq-anim', el);
      playBtn = h('button', 'btn', bar);
      playBtn.type = 'button';
      playBtn.addEventListener('click', () => { playing = !playing; sync(); });
      const sr = h('div', 'mq-p', bar);
      const lab = h('label', 'mq-lab', sr, def.t.label || 'time');
      lab.htmlFor = `${id}-t-r`;
      const range = h('input', null, sr);
      range.id = `${id}-t-r`;
      range.type = 'range'; range.min = def.t.min; range.max = def.t.max; range.step = def.t.step || 0.01;
      range.addEventListener('input', () => { model.set('t', range.value); update(); });
      inputs.t = [range];
      const sp = h('div', 'mq-speed', bar);
      const spLab = h('label', 'mq-lab', sp, 'Speed');
      const spSel = h('select', null, sp);
      spSel.id = spLab.htmlFor = `${id}-speed`;
      for (const v of SPEEDS) {
        const o = h('option', null, spSel, '×' + v);
        o.value = v;
        o.selected = v === speed;
      }
      spSel.addEventListener('change', () => { speed = +spSel.value; savePrefs({ speed }); });
      playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    const live = h('p', 'mq-live', el);
    const desc = h('p', 'mq-desc', el);
    desc.setAttribute('aria-live', 'polite');

    function tick(now) {
      raf = 0;
      if (!playing || !visible) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const span = def.t.max - def.t.min;
      let t = model.state().t + dt * (def.t.speed || 1) * BASE_RATE * speed;
      if (t > def.t.max) t = def.t.min + ((t - def.t.min) % span);
      model.set('t', t);
      update();
      raf = requestAnimationFrame(tick);
    }
    function sync() {
      if (playBtn) playBtn.textContent = playing ? 'Pause' : 'Play';
      if (playing && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }

    const hl = term => {
      el.querySelectorAll('[data-term]').forEach(n => n.classList.toggle('hl', !!term && n.dataset.term === term));
      if (is3d) MQ.three3d.highlight(stage, term);
    };
    const over = e => { const n = e.target.closest && e.target.closest('[data-term]'); hl(n ? n.dataset.term : null); };
    el.addEventListener('mouseover', over);
    el.addEventListener('focusin', over);
    el.addEventListener('mouseout', () => hl(null));
    el.addEventListener('focusout', () => hl(null));

    function update() {
      const st = model.state();
      for (const n in inputs) inputs[n].forEach(i => { if (document.activeElement !== i) i.value = n === 't' ? st.t : st.params[n]; });
      live.textContent = model.live();
      desc.textContent = model.describe();
      const set = (n, v) => { model.set(n, v); update(); };
      if (is3d) MQ.three3d.show(stage, def.draw, st, colorOf, { onHover: hl });
      else MQ.svg2d.draw(svg, def.draw, st, colorOf, set);
      if (!is3d) { const t = el.querySelector('.hl'); if (t) hl(t.dataset.term); }
      if (onChange) onChange(st);
    }

    let io;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(es => {
        visible = es[es.length - 1].isIntersecting;
        if (def.t) sync();
        if (is3d && visible) update();
      });
      io.observe(el);
    }
    update();
    sync();

    return { model, destroy() { playing = false; if (raf) cancelAnimationFrame(raf); if (io) io.disconnect(); if (is3d) MQ.three3d.hide(stage); el.replaceChildren(); } };
  };
})();
