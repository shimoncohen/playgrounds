import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const isScript = (m) => m.kind === 'script' || m.kind === 'challenge';
const LINES = ['echo hi', 'ls'];

const SQ = loadShell();
const chapters = SQ.content.chapters;
const verdict = (m, line) => SQ.missionVerdict(m, SQ.ctxFor(line), false).good;

function enter(i) {
  SQ.S.ch = i;
  SQ.resetProcs();
  SQ.setupChapter(chapters[i]);
}

function solve(ch, m) {
  if (isScript(m)) {
    const e = SQ.writeFile(SQ.norm(m.file, SQ.HOME), m.answer, false, m.file);
    assert.equal(e, null, `${m.title}: cannot save ${m.file}`);
    return [];
  }
  const parts = m.steps ? m.steps.map((s) => s.answer) : [m.answer];
  parts.forEach((a) => run(SQ, a));
  return parts;
}

const units = (m) => (m.steps ? m.steps : [m]);

function playAll(visit) {
  SQ.resetState(SQ.fresh());
  chapters.forEach((ch, i) => {
    enter(i);
    ch.missions.forEach((m, j) => {
      visit(i, j, m);
      solve(ch, m);
    });
  });
}

const label = (i, j, m, line) => `${i + 1}.${j + 1} ${m.title} completed by "${line}"`;
// Typing the command a plain mission teaches (echo for "Say something") is a real answer.
const teaches = (m, l) => units(m).some((u) => !/[>|;&]/.test(u.answer) && u.answer.split(' ')[0] === l.split(' ')[0]);
const skipScript = (m) => isScript(m); // file-judged: the file exists only once the learner saved it

describe('a mission completes only on the learner own action', () => {
  it('(a) right after its own answer, an unrelated line does not complete it again', () => {
    const bad = [];
    playAll((i, j, m) => {
      if (skipScript(m)) return;
      const snap = JSON.stringify(SQ.S);
      if (!m.steps) {
        run(SQ, m.answer);
        assert.ok(verdict(m, m.answer), `${i + 1}.${j + 1} ${m.title}: its answer does not complete it`);
        for (const l of LINES) if (!teaches(m, l)) { run(SQ, l); if (verdict(m, l)) bad.push(label(i, j, m, l)); }
      }
      SQ.resetState(JSON.parse(snap));
    });
    assert.deepEqual(bad, []);
  });

  it('(b) in the end state of the whole course, an unrelated line does not complete any mission', () => {
    const bad = [];
    playAll(() => {});
    const snap = JSON.stringify(SQ.S);
    chapters.forEach((ch, i) => ch.missions.forEach((m, j) => {
      if (skipScript(m)) return;
      for (const u of units(m)) for (const l of LINES) {
        if (teaches(m, l)) continue;
        SQ.resetState(JSON.parse(snap));
        run(SQ, l);
        if (verdict(u, l)) bad.push(label(i, j, m, l));
      }
    }));
    assert.deepEqual(bad, []);
  });

  it('(c) one run of the answer completes each mission when its prerequisites exist', () => {
    const bad = [];
    playAll((i, j, m) => {
      if (skipScript(m) || m.steps) return;
      const snap = JSON.stringify(SQ.S);
      run(SQ, m.answer);
      if (!verdict(m, m.answer)) bad.push(`${i + 1}.${j + 1} ${m.title}`);
      SQ.resetState(JSON.parse(snap));
    });
    assert.deepEqual(bad, []);
  });
});

describe('the forms a learner may type still complete the mission', () => {
  const at = (title) => { for (const ch of chapters) { const m = ch.missions.find((x) => x.title === title); if (m) return m; } };
  const fresh = () => { SQ.resetState(SQ.fresh()); enter(0); };
  const cases = [
    ['Walk into the forest', ['cd ~/forest']],
    ['Build a camp', ['mkdir -p camp']],
    ['Pitch a tent', ['mkdir camp; echo -n "" > camp/tent.txt']],
    ['Start a diary', ['mkdir camp; printf "Day 1\\n" > camp/diary.txt', 'mkdir camp; echo Day 1 | tee camp/diary.txt']],
    ['Add a second entry', ['mkdir camp; echo a > camp/diary.txt; echo b >> camp/diary.txt', 'mkdir camp; echo a | tee camp/diary.txt; echo b | tee -a camp/diary.txt']],
    ['Remove an empty folder', ['mkdir -p camp/supplies/food; rm -r camp/supplies/food']],
  ];
  for (const [title, setups] of cases) {
    it(`${title}: ${setups.join(' | ')}`, () => {
      const m = at(title);
      for (const s of setups) {
        fresh();
        const pre = s.split('; ');
        const last = pre.pop();
        pre.forEach((l) => run(SQ, l));
        run(SQ, last);
        assert.ok(verdict(m, last), `${title}: "${s}" should complete it`);
      }
    });
  }

  it('an editor Save of the mission file completes the script-writing and diary missions', () => {
    fresh();
    run(SQ, 'mkdir camp');
    SQ.writeFile(SQ.norm('~/camp/diary.txt', SQ.HOME), 'Day 1', false, 'camp/diary.txt');
    SQ.rt.log = [];
    assert.ok(SQ.missionVerdict(at('Start a diary'), SQ.ctxFor('(saved camp/diary.txt)'), false).good);
    SQ.writeFile(SQ.norm('~/pack.sh', SQ.HOME), 'echo hi', false, 'pack.sh');
    assert.ok(SQ.missionVerdict(at('Write a script'), SQ.ctxFor('(saved pack.sh)'), false).good);
  });
});
