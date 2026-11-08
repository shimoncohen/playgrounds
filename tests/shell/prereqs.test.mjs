import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const isScript = (m) => m.kind === 'script' || m.kind === 'challenge';
const SQ = loadShell();
const chapters = SQ.content.chapters;
const verdict = (m, line) => SQ.missionVerdict(m, SQ.ctxFor(line), false).good;

function land(i, j) {
  SQ.resetState(SQ.fresh());
  SQ.S.ch = i;
  SQ.resetProcs();
  SQ.setupChapter(chapters[i]);
  return chapters[i].missions[j];
}

function answer(m) {
  if (isScript(m)) {
    assert.equal(SQ.writeFile(SQ.norm(m.file, SQ.HOME), m.answer, false, m.file), null);
    return verdict(m, '');
  }
  const parts = m.steps ? m.steps : [m];
  return parts.every((p) => { run(SQ, p.answer); return verdict(p, p.answer); });
}

describe('a mission opened out of order sets up what it needs', () => {
  chapters.forEach((ch, i) => ch.missions.forEach((m, j) => {
    it(`${i + 1}.${j + 1} ${m.title}: jumped to directly, its answer completes it`, () => {
      const mm = land(i, j);
      SQ.ensureNeeds(mm);
      if (mm.need && !mm.steps) assert.ok(!verdict(mm, ''), 'setup alone must not complete the mission');
      assert.ok(answer(mm), 'the answer does not complete it');
    });
  }));

  it('every mission that declares need also declares pre and made', () => {
    for (const ch of chapters) for (const m of ch.missions) if (m.need || m.pre || m.made) {
      assert.equal(typeof m.need, 'function', m.title);
      assert.ok(Array.isArray(m.pre) && m.pre.length, m.title);
      assert.match(m.made, /^(made|exported|started) /, m.title);
    }
  });

  it('playing the course in order never needs a setup', () => {
    SQ.resetState(SQ.fresh());
    const ran = [];
    chapters.forEach((ch, i) => {
      SQ.S.ch = i;
      SQ.resetProcs();
      SQ.setupChapter(ch);
      ch.missions.forEach((m, j) => {
        if (SQ.ensureNeeds(m)) ran.push(`${i + 1}.${j + 1}`);
        answer(m);
      });
    });
    assert.deepEqual(ran, []);
  });

  it('setup leaves no trace: cwd, $?, the line log and learner files are untouched', () => {
    const m = chapters[6].missions.find((x) => x.title === 'Run your script');
    land(6, 0);
    run(SQ, 'echo mine > pack.sh');
    run(SQ, 'cd forest');
    run(SQ, 'false');
    const cwd = SQ.S.cwd, last = SQ.S.last;
    assert.ok(SQ.ensureNeeds(m));
    assert.equal(SQ.S.cwd, cwd);
    assert.equal(SQ.S.last, last);
    assert.equal(SQ.rt.log.length, 0);
    assert.equal(SQ.getNode(SQ.norm('~/pack.sh')).content, 'mine');
    assert.ok(SQ.getNode(SQ.norm('~/pack.sh')).exec);
    assert.ok(!SQ.ensureNeeds(m), 'a second call has nothing left to do');
  });

  it('a diary the learner already wrote is never replaced', () => {
    const m = land(1, 4);
    run(SQ, 'mkdir camp');
    run(SQ, 'echo mine > camp/diary.txt');
    assert.ok(!SQ.ensureNeeds(m));
    assert.equal(SQ.getNode(SQ.norm('~/camp/diary.txt')).content, 'mine');
  });
});
