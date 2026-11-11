import { readFileSync } from 'node:fs';

// Evaluates the real rule from shared/progress.js, so tests never keep a copy that can drift.
const src = readFileSync(new URL('../shared/progress.js', import.meta.url), 'utf8');
const from = src.indexOf('  const TEXT_MAPS'), to = src.indexOf('  const hasProgress');
if (from < 0 || to < from) throw new Error('shared/progress.js no longer has the TEXT_MAPS to hasProgress block; update tests/pristine.mjs');
const block = src.slice(from, to);
export const pristineFor = cfg => new Function('cfg', `${block}\nreturn pristine;`)(cfg);
export const pristine = pristineFor({});
