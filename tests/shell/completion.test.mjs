// "Mission complete" must be honest: a line that says "command not found" never completes a mission,
// and an example in a mission's text completes it only when it teaches the same lesson (ALLOWED_EXAMPLES).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const isScript = (m) => m.kind === 'script' || m.kind === 'challenge';
const verdict = (SQ, m, line) => SQ.missionVerdict(m, SQ.ctxFor(line)).good;
const decode = (s) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const ucFirst = (s) => s.replace(/^[a-z]/, (c) => c.toUpperCase());
// Same two-step mission as solvability.test.mjs: the answer only finds the path, a later `cat` solves it.
const TWO_STEP = { 'Treasure hunt': true };

// Examples written in a mission's text that may complete it, because they teach the same lesson as its answer. Any other example that
// completes a mission is a check that is too loose (echo village/logs/day?.log is the ? lesson, not the * one; echo $HOME is not the variable you stored).
const ALLOWED_EXAMPLES = {
  'Teleport home': ['cd'], // bare cd goes home too
  'Find the line numbers': ['grep -in map journal.txt'], // -n with -i
  'List the jobs': ['jobs -l'],
  'Wait for it': ['wait', 'wait %1'], // the job may start on an earlier line
  "See the whole pipeline's status": ["bash -c 'set -euo pipefail; false | true; echo after'"], // pipefail makes the failure count: the shell stops
  'Trace it': ['name=Ada; set -x; echo "hi $name"; set +x'],
};


describe('a command-not-found line never completes a mission', () => {
  it('the reported case: Sort village/people.txt | uniq -c (capital S) is not "Count each name"', () => {
    const SQ = loadShell();
    const ch = SQ.content.chapters.find((c) => c.missions.some((m) => m.title === 'Count each name'));
    const m = ch.missions.find((x) => x.title === 'Count each name');
    ch.setup();
    const bad = run(SQ, 'Sort village/people.txt | uniq -c');
    assert.match(bad.out, /Sort: command not found/);
    assert.equal(verdict(SQ, m, 'Sort village/people.txt | uniq -c'), false);
    run(SQ, m.answer);
    assert.equal(verdict(SQ, m, m.answer), true, 'the real command still completes it');
  });

  it('a not-found command anywhere in the line blocks completion, in a pipe, a list or after the answer', () => {
    const SQ = loadShell();
    const ch = SQ.content.chapters.find((c) => c.missions.some((m) => m.title === 'Count each name'));
    const m = ch.missions.find((x) => x.title === 'Count each name');
    ch.setup();
    for (const line of ['nosuchcmd | sort village/people.txt | uniq -c', `${m.answer} | nosuchcmd`, `nosuchcmd; ${m.answer}`, `${m.answer}; nosuchcmd`, `${m.answer} && nosuchcmd`]) {
      run(SQ, line);
      assert.equal(verdict(SQ, m, line), false, `completed by: ${line}`);
    }
  });

  it('a typo in a background job that is waited for (Sleep 5 & wait) does not complete "Wait for it"', () => {
    const SQ = loadShell();
    const ch = SQ.content.chapters.find((c) => c.missions.some((m) => m.title === 'Wait for it'));
    const m = ch.missions.find((x) => x.title === 'Wait for it');
    ch.setup();
    run(SQ, 'sleep 30 &'); // a real job to wait on, as an earlier mission leaves behind
    run(SQ, 'Sleep 5 & wait');
    assert.equal(verdict(SQ, m, 'Sleep 5 & wait'), false);
  });

  it('the ? example does not complete the * mission, and $HOME does not complete "Use the value"', () => {
    const SQ = loadShell();
    const ch = SQ.content.chapters.find((c) => c.missions.some((m) => m.title === 'See what the star becomes'));
    const star = ch.missions.find((x) => x.title === 'See what the star becomes');
    ch.setup();
    run(SQ, 'echo village/logs/day?.log');
    assert.equal(verdict(SQ, star, 'echo village/logs/day?.log'), false);
    run(SQ, star.answer);
    assert.equal(verdict(SQ, star, star.answer), true);
    const ch2 = SQ.content.chapters.find((c) => c.missions.some((m) => m.title === 'Use the value'));
    const use = ch2.missions.find((x) => x.title === 'Use the value');
    ch2.setup();
    for (const l of ['echo $HOME', 'echo $USER']) {
      run(SQ, l);
      assert.equal(verdict(SQ, use, l), false, l);
    }
    run(SQ, 'NAME="Ada"');
    for (const l of ['echo $NAME', 'echo "Hello, ${NAME}"', use.answer]) {
      run(SQ, l);
      assert.equal(verdict(SQ, use, l), true, l);
    }
  });

  it('a friendly "not supported" refusal (sudo ...) counts as not found too', () => {
    const SQ = loadShell();
    const ch = SQ.content.chapters[0];
    ch.setup();
    run(SQ, 'sudo ls');
    assert.ok(SQ.rt.log.some((e) => e.nf), 'the refusal is logged as not found');
  });

  SQ_CHAPTERS().forEach((idx) => {
    it(`chapter ${idx + 1}: every command mission rejects its answer typed with a typo'd or extra unknown command`, () => {
      const ch = loadShell().content.chapters[idx];
      let checked = 0;
      ch.missions.forEach((m, mi) => {
        if (isScript(m)) return;
        let SQ = worldBefore(idx, mi);
        const solve = TWO_STEP[m.title] ? `cat ${run(SQ, m.answer).out.split('\n').find((l) => l.trim()).trim()}` : m.answer;
        run(SQ, solve);
        assert.equal(SQ.rt.log.some((e) => e.nf), false, `"${m.title}": its own answer reports command not found`);
        assert.equal(verdict(SQ, SQ.content.chapters[idx].missions[mi], solve), true, `"${m.title}": answer does not pass`);
        const word = m.answer.match(/^([A-Za-z]+)\b/);
        // a & sends the pipeline to the background, where its errors arrive later: only the plain prefix applies
        const bg = /(?<!&)&(?!&)/.test(solve);
        const variants = bg ? [`nosuchcmd; ${solve}`] : [`nosuchcmd | ${solve}`, `${solve}; nosuchcmd`];
        // a typo'd background command that is killed before it ever ran (Sleep 100 & kill %1) is not seen as not found: known gap
        if (!bg && word && SQ.CMDS && SQ.CMDS[word[1]] && !TWO_STEP[m.title]) variants.push(ucFirst(solve));
        for (const v of variants) {
          SQ = worldBefore(idx, mi);
          if (TWO_STEP[m.title]) run(SQ, m.answer);
          run(SQ, v);
          assert.ok(SQ.rt.log.some((e) => e.nf), `"${m.title}": ${JSON.stringify(v)} was meant to hit a command not found`);
          assert.equal(verdict(SQ, SQ.content.chapters[idx].missions[mi], v), false, `"${m.title}": completed by ${JSON.stringify(v)}`);
          checked++;
        }
      });
      assert.ok(checked > 0);
    });
  });
});

describe('examples in a mission text complete it only when they teach the same lesson', () => {
  SQ_CHAPTERS().forEach((idx) => {
    it(`chapter ${idx + 1}`, () => {
      const ch = loadShell().content.chapters[idx];
      ch.missions.forEach((m, mi) => {
        if (isScript(m) || TWO_STEP[m.title]) return;
        const text = [m.goal, m.explain, m.hint].filter(Boolean).join(' ');
        const snippets = [...new Set([...text.matchAll(/<code>(.*?)<\/code>/g)].map((x) => decode(x[1]).replace(/<[^>]+>/g, '')))].filter((s) => s !== m.answer && /^[a-z]/.test(s));
        for (const s of snippets) {
          // a fresh world with the earlier missions of the chapter already solved, as a learner would have it
          const SQ = worldBefore(idx, mi);
          const c = SQ.content.chapters[idx];
          run(SQ, s);
          if (verdict(SQ, c.missions[mi], s)) assert.ok((ALLOWED_EXAMPLES[m.title] || []).includes(s), `"${m.title}": the text example ${JSON.stringify(s)} completes it, but teaches another lesson than ${JSON.stringify(m.answer)} (loosen ALLOWED_EXAMPLES only if it is the same lesson, else tighten the check)`);
        }
      });
    });
  });
});

// A fresh shell with chapter `idx` set up and its missions before `mi` solved, as a learner would have it.
function worldBefore(idx, mi) {
  const SQ = loadShell();
  const c = SQ.content.chapters[idx];
  c.setup();
  for (const p of c.missions.slice(0, mi)) {
    if (isScript(p)) SQ.writeFile(SQ.norm(p.file, SQ.HOME), p.answer, false, p.file);
    else if (!TWO_STEP[p.title]) run(SQ, p.answer);
  }
  return SQ;
}

function SQ_CHAPTERS() {
  return loadShell().content.chapters.map((_, i) => i);
}
