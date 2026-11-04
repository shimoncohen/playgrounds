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
  safe.import(Object.fromEntries(blocked.map(n => [n, refuse(n)])), { override: true });

  MQ.math = { full, safe: Object.assign(Object.create(safe), { evaluate }), blocked };
})();
