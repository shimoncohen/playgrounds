// Python Quest: every mission is solvable by its own answer, and its check is not fooled by the starter or an empty program.
// Same pass rule as the UI run(): no error and check === true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../content-loader.mjs';

const { PY, CH, makeCtx } = loadContent('python-quest', { parts: [[null, 'const ERRS={']], returns: ['PY', 'CH', 'makeCtx'], mustInclude: ['function makeCtx('] });

const passes = (m, src) => {
  const inputs = m.inputs || [];
  const res = PY.run(src, { inputs });
  if (res.error) return false;
  try { return m.check(makeCtx(src, res, inputs)) === true; } catch { return false; }
};

for (const [ci, ch] of CH.entries()) {
  for (const [mi, m] of ch.missions.entries()) {
    const id = `${ci}.${mi} ${m.title}`;
    test(`${id}: the reference answer passes`, () => {
      assert.equal(passes(m, m.answer), true);
    });
    // Such a mission passes as given, so the starter probe does not apply.
    if (m.answer !== undefined && m.answer !== m.starter) {
      test(`${id}: the starter code does not pass`, () => {
        assert.equal(passes(m, m.starter), false);
      });
    }
    test(`${id}: an empty program does not pass`, () => {
      assert.equal(passes(m, ''), false);
    });
  }
}
