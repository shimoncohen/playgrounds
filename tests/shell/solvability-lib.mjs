// Shared solvability rules for the mission kinds (command/outcome and script/challenge).
import assert from 'node:assert/strict';
import { run } from './harness.mjs';

const isScript = (m) => m.kind === 'script' || m.kind === 'challenge';

// Does the mission's own pass rule accept the current world? `check` wins; otherwise scriptPasses.
const passes = (SQ, m, line) => (m.check ? !!m.check(SQ.ctxFor(line)) : SQ.ctxFor(line).scriptPasses(m).ok);

function put(SQ, m, text) {
  const e = SQ.writeFile(SQ.norm(m.file, SQ.HOME), text, false, m.file);
  assert.equal(e, null, `mission "${m.title}": cannot write ${m.file}: ${e}`);
}

// Throws (assert) when the mission is malformed or unsolvable. `ch` is the chapter in this SQ's content.
export function assertSolvable(SQ, ch, m, twoStep) {
  if (!isScript(m)) {
    let last = m.answer;
    if (twoStep && twoStep[m.title]) last = twoStep[m.title](SQ, m);
    run(SQ, last);
    assert.ok(m.check(SQ.ctxFor(last)), `mission "${m.title}" not solved by: ${last}`);
    return;
  }
  const t = `mission "${m.title}"`;
  assert.equal(typeof m.file, 'string', `${t}: file is required`);
  assert.ok(Array.isArray(m.tests) && m.tests.length > 0, `${t}: needs at least one test case (an empty list passes vacuously)`);
  m.tests.forEach((tc, i) => assert.ok(tc.label, `${t}: test case ${i + 1} has no label`));
  if (!m.check) {
    assert.equal(typeof m.answer, 'string', `${t}: answer is required when check is absent`);
    assert.ok(m.tests && m.tests.length, `${t}: tests are required when check is absent`);
  }
  assert.equal(typeof m.answer, 'string', `${t}: answer is required`);
  SQ.setupChapter(ch);
  const before = SQ.getNode(SQ.norm(m.file, SQ.HOME));
  if (typeof m.starter === 'string') {
    assert.ok(before && before.content === m.starter, `${t}: setup should leave the starter in ${m.file}`);
    assert.ok(!passes(SQ, m, ''), `${t}: the starter must not pass`);
  }
  put(SQ, m, m.answer);
  assert.ok(passes(SQ, m, ''), `${t}: the answer does not pass`);
  SQ.setupChapter(ch);
  assert.equal(SQ.getNode(SQ.norm(m.file, SQ.HOME)).content, m.answer, `${t}: setup must not overwrite an existing file`);
  (m.wrong || []).forEach((w, i) => {
    put(SQ, m, w);
    assert.ok(!passes(SQ, m, ''), `${t}: wrong script ${i + 1} passes`);
  });
}
