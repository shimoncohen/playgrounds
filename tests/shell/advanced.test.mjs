// Mission kinds: script and challenge missions, with two fake chapters injected through the harness (Task 10).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, run } from './harness.mjs';
import { assertSolvable } from './solvability-lib.mjs';

const FAKE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/fake-advanced.js');
function withFake() {
  const ctx = loadContext();
  vm.runInContext(fs.readFileSync(FAKE, 'utf8'), ctx, { filename: FAKE });
  const SQ = ctx.SQ;
  const ch = SQ.content.chapters[SQ.content.chapters.length - 1];
  return { SQ, ch, hi: ch.missions[0], cnt: ch.missions[1] };
}
const put = (SQ, m, text) => assert.equal(SQ.writeFile(SQ.norm(m.file, SQ.HOME), text, false, m.file), null);

describe('mission kinds', () => {
  it('the fake chapter lands in the advanced tier at 20 XP per mission', () => {
    const { SQ, ch } = withFake();
    const i = SQ.content.chapters.indexOf(ch);
    assert.equal(SQ.tiers.tierOf(i).id, 'advanced');
    assert.equal(SQ.tiers.missionXp(i), 20);
  });

  it('the solvability rules pass the script mission and the challenge mission', () => {
    const { SQ, ch, hi, cnt } = withFake();
    assertSolvable(SQ, ch, hi);
    assertSolvable(SQ, ch, cnt);
  });

  it('setup writes the starter only when the file is absent', () => {
    const { SQ, ch, hi } = withFake();
    SQ.setupChapter(ch);
    assert.equal(SQ.getNode(SQ.norm(hi.file, SQ.HOME)).content, hi.starter);
    put(SQ, hi, 'echo mine\n');
    SQ.setupChapter(ch);
    assert.equal(SQ.getNode(SQ.norm(hi.file, SQ.HOME)).content, 'echo mine\n');
  });

  it('no check on a script mission: scriptPasses decides; wrong scripts give the failing case', () => {
    const { SQ, ch, hi } = withFake();
    assert.equal(hi.check, undefined);
    SQ.setupChapter(ch);
    assert.equal(SQ.ctxFor('').scriptPasses(hi).ok, false);
    put(SQ, hi, hi.wrong[0]);
    const r = SQ.ctxFor('').scriptPasses(hi);
    assert.equal(r.ok, false);
    assert.equal(r.failed.index, 1);
    assert.equal(SQ.scriptFailLine(hi, r.failed), 'Test 2 (no name) failed: expected "Hi nobody", got "Hi "');
    put(SQ, hi, hi.answer);
    assert.equal(SQ.ctxFor('').scriptPasses(hi).ok, true);
  });

  it('the failing-case line: first starter case, missing file, 120-character cut, one line', () => {
    const { SQ, ch, hi } = withFake();
    SQ.setupChapter(ch);
    const f = SQ.ctxFor('').scriptPasses(hi).failed;
    assert.equal(SQ.scriptFailLine(hi, f), 'Test 1 (with a name) failed: expected "Hi Ada", got "Hi"');
    assert.equal(SQ.scriptFailLine(hi, { index: -1, label: 'file' }), 'Save your script as scripts/hi.sh first (nano scripts/hi.sh).');
    const long = SQ.scriptFailLine(hi, { index: 0, label: 'x', expected: 'e'.repeat(200), got: 'a\nb' });
    assert.equal(long.length, 120);
    assert.ok(!long.includes('\n'));
  });

  it('challenge: the custom check wins over the test cases', () => {
    const { SQ, ch, cnt } = withFake();
    SQ.setupChapter(ch);
    put(SQ, cnt, cnt.wrong[1]);
    assert.equal(SQ.ctxFor('').scriptPasses(cnt).ok, false);
    put(SQ, cnt, '#!/bin/bash\n# read\necho 2\n');
    assert.equal(SQ.ctxFor('').scriptPasses(cnt).ok, true, 'cases alone pass this one');
    assert.equal(cnt.check(SQ.ctxFor('')), true);
    put(SQ, cnt, 'echo 2\n');
    assert.equal(cnt.check(SQ.ctxFor('')), false, 'cases pass but the check rejects it');
  });

  it('the solvability rules reject malformed script missions', () => {
    const { SQ, ch, hi } = withFake();
    const mk = (over) => Object.assign({}, hi, over);
    const bad = (m) => assert.throws(() => assertSolvable(SQ, ch, m));
    bad(mk({ tests: [] }));
    bad(mk({ tests: undefined }));
    bad(mk({ tests: [{ args: [], expectOut: 'x' }] }));
    bad(mk({ answer: '#!/bin/bash\necho no\n' }));
    bad(mk({ starter: hi.answer }));
    bad(mk({ wrong: [hi.answer] }));
    bad(mk({ file: undefined }));
  });

  it('a script that runs away is a failed case, not an exception', () => {
    const { SQ, ch, hi } = withFake();
    SQ.setupChapter(ch);
    put(SQ, hi, 'while true; do :; done\n');
    assert.equal(SQ.ctxFor('').scriptPasses(hi).ok, false);
  });
});
