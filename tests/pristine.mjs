import { readFileSync } from 'node:fs';

// Evaluates the real rule from shared/progress.js, so tests never keep a copy that can drift.
const src = readFileSync(new URL('../shared/progress.js', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('  const TEXT_MAPS'), src.indexOf('  const hasProgress'));
export const pristine = new Function(`${block}\nreturn pristine;`)();
