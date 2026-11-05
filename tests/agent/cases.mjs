// Shared case-table runner for the per-mission suites (content-core, content-dev). Not matched by the test glob.
// Positions are [chapter, mission], both 0-based. pass: inputs that must pass. fail: inputs that parse and run but must not pass.
// refused: prompt inputs with a line that does not parse, so the agent is never run.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

export const kit = (AQ) => ({
  M: (c, i) => AQ.CH[c].missions[i],
  go: (c, i, input) => AQ.evaluate(AQ.CH[c].missions[i], input, { approved: true }),
});

// title is "<scope>: <what>"; <scope> names the chapters in the completeness test. skip(c, ch) leaves a chapter out of it.
export function runCases(AQ, title, CASES, skip = () => false) {
  const { M, go } = kit(AQ), F = (files) => ({ files });
  describe(title, () => {
    for (const k of CASES) {
      const [c, i] = k.at, name = `[${c}, ${i}] ${M(c, i).title}`;
      it(`${name}: spelled differently, it still passes`, () => k.pass.forEach((x) => assert.equal(go(c, i, x).result, true, JSON.stringify(x))));
      it(`${name}: nearby and lazy inputs fail with a reason`, () => k.fail.filter(Boolean).forEach((x) => {
        const r = go(c, i, x);
        assert.ok(!r.refused, `${JSON.stringify(x)} was refused`);
        assert.equal(typeof r.result, 'string', JSON.stringify(x));
        assert.ok(r.result.length > 20, JSON.stringify(x));
      }));
      if (k.refused) it(`${name}: a line that does not parse means the agent is not run`, () => k.refused.forEach((x) => {
        const r = go(c, i, x);
        assert.equal(r.refused, true, JSON.stringify(x));
        assert.equal(r.outcome, null);
        assert.match(r.result, /was not run/);
      }));
      if (M(c, i).kind !== 'prompt') it(`${name}: deleting everything fails`, () => {
        const empty = Object.fromEntries(Object.keys(AQ.scenarios[M(c, i).scenario].vfs).filter(AQ.editable).map((p) => [p, '']));
        assert.equal(typeof go(c, i, F(empty)).result, 'string');
      });
    }
    it(`every mission of ${title.split(':')[0]} has a case table`, () => {
      const have = new Set(CASES.map((k) => k.at.join(',')));
      AQ.CH.forEach((ch, c) => { if (!skip(c, ch)) ch.missions.forEach((_, i) => assert.ok(have.has(`${c},${i}`), `[${c}, ${i}]`)); });
    });
  });
}
