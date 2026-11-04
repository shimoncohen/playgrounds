(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};
  MQ.scene = MQ.scene || {};

  const num = v => String(+v.toFixed(4));
  const show = v => typeof v === 'number' ? num(v) : String(v);

  MQ.scene.model = def => {
    const names = Object.keys(def.params);
    const p = {};
    for (const n of names) p[n] = def.params[n].value;
    let t = def.t ? def.t.value : 0;
    const snap = (spec, v) => {
      const step = spec.step || 1;
      return +Math.min(spec.max, Math.max(spec.min, spec.min + Math.round((v - spec.min) / step) * step)).toFixed(10);
    };
    const derived = () => (def.derived ? def.derived(p) : {});
    const all = () => ({ ...p, ...derived() });
    const terms = [...names, ...(def.terms || [])];

    return {
      set(name, value) {
        value = Number(value);
        if (!Number.isFinite(value)) return;
        if (name === 't' && def.t) t = snap(def.t, value);
        else if (def.params[name]) p[name] = snap(def.params[name], value);
      },
      state: () => ({ params: { ...p }, derived: derived(), t }),
      live: () => typeof def.live === 'function' ? def.live({ params: { ...p }, derived: derived(), t }) : def.live.replace(/\{(\w+)\}/g, (m, k) => (k in all() ? show(all()[k]) : m)),
      describe() {
        const parts = names.map(n => `${def.params[n].label} ${show(p[n])}`).join(', ');
        const d = Object.entries(derived()).map(([k, v]) => `${k} = ${show(v)}`).join('. ');
        return parts + (d ? `. ${d}` : '') + '.';
      },
      colorOf: term => MQ.palette[Math.max(0, terms.indexOf(term)) % MQ.palette.length],
    };
  };

  MQ.scene.forMission = (ch, m, fill) => {
    const def = (m && m.scene) || ch.scene;
    const start = { ...(m && m.at), ...(fill && m && m.kind === 'scene' ? m.answer : {}) };
    return { ...def, params: Object.fromEntries(Object.entries(def.params).map(([n, p]) => [n, { ...p, value: start[n] ?? p.value }])) };
  };
})();
