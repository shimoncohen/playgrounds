(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};
  const math = globalThis.math;

  // The UMD bundle has no math.all; its create() already holds every factory and takes the config first.
  const full = math.create();
  const safe = math.create({ number: 'Fraction' });
  // The override replaces evaluate on the whole instance, so learner input goes through this saved copy.
  const evaluate = safe.evaluate;
  const blocked = ['import', 'createUnit', 'reviver', 'evaluate', 'parse', 'simplify', 'derivative', 'resolve'];
  const refuse = name => () => { throw new Error(name + ' is disabled'); };
  // sqrt of a Fraction throws in this config (it tries BigNumber); a perfect square stays exact, the rest becomes a decimal.
  const root = f => {
    const n = Math.sqrt(Number(f.n)), d = Math.sqrt(Number(f.d));
    return f.valueOf() < 0 ? NaN : Number.isInteger(n) && Number.isInteger(d) ? safe.fraction(n, d) : n / d;
  };
  safe.import({ sqrt: safe.typed('sqrt', { number: Math.sqrt, Fraction: root }) }, { override: true });
  safe.import(Object.fromEntries(blocked.map(n => [n, refuse(n)])), { override: true });

  MQ.math = { full, safe: Object.assign(Object.create(safe), { evaluate }), blocked };
})();
