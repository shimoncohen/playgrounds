// Agent Quest content: every mission is solvable by its own answer, and neither the parsing-but-wrong answer, the lazy
// answer nor an empty input passes. Answers are inputs; the simulator decides whether they pass.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent } from './harness.mjs';

const AQ = loadAgent();
const plain = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&(?:gt|lt|amp|quot);/g, ' ');
const M = (c, i) => AQ.CH[c].missions[i];
const run = (c, i, input) => AQ.runMission(M(c, i), input);

describe('chapters', () => {
  it('there is at least one chapter, shaped as the model says', () => {
    assert.ok(AQ.CH.length >= 1);
    for (const ch of AQ.CH) {
      for (const f of ['name', 'badge', 'tier', 'intro']) assert.ok(typeof ch[f] === 'string' && ch[f].trim(), f);
      assert.ok(AQ.TIERS.some((t) => t.id === ch.tier), ch.tier);
      assert.ok(Array.isArray(ch.learned) && ch.learned.length);
      assert.ok(ch.missions.length >= 3 && ch.missions.length <= 8);
    }
  });
  it('chapter 1 has about five missions', () => assert.equal(AQ.CH[0].missions.length, 5));
});

describe('every mission of every chapter', () => {
  const keys = new Set(), titles = new Set();
  AQ.CH.forEach((ch, c) => ch.missions.forEach((m, i) => {
    describe(`${c}.${i} ${m.title}`, () => {
      it('has a unique key and title, a known scenario and kind, and the text fields', () => {
        assert.ok(!keys.has(`${c}.${i}`)); keys.add(`${c}.${i}`);
        assert.ok(!titles.has(m.title), 'unique title'); titles.add(m.title);
        assert.ok(Object.prototype.hasOwnProperty.call(AQ.scenarios, m.scenario), m.scenario);
        assert.ok(AQ.KINDS.includes(m.kind), m.kind);
        for (const f of ['title', 'goal', 'explain', 'hint']) assert.ok(typeof m[f] === 'string' && m[f].trim(), f);
        for (const id of m.facts || []) assert.ok(AQ.facts.byId(id), `fact ${id}`);
        if (m.kind !== 'prompt') assert.ok(m.answer && typeof m.answer === 'object' && m.answer.files, 'config answers are setup files');
        if (m.prompt) assert.deepEqual(AQ.config.parsePrompt(m.prompt, AQ.scenarios[m.scenario]).errors.length, 0, 'the mission prompt parses');
      });
      it('the reference answer passes', () => assert.equal(AQ.runMission(m, m.answer), true));
      it('the parsing-but-wrong answer and the lazy answer fail with a reason', () => {
        for (const x of [m.wrong, m.lazy]) {
          const r = AQ.runMission(m, x);
          assert.equal(typeof r, 'string');
          assert.ok(r.length > 20);
        }
      });
      it('the three inputs differ and an empty input fails', () => {
        const j = (x) => JSON.stringify(x);
        assert.equal(new Set([j(m.answer), j(m.wrong), j(m.lazy)]).size, 3);
        for (const empty of ['', '   ', {}, { prompt: '', files: {} }, null, undefined, 5]) assert.equal(typeof AQ.runMission(m, empty), 'string', j(empty));
      });
      it('how starts with the whole line, then the parts', () => {
        assert.ok(Array.isArray(m.how) && m.how.length >= 3 && m.how.length <= 5, 'three to five steps');
        assert.match(m.how[0], /<code>[^<]+<\/code>/);
        assert.ok(plain(m.how[0]).trim().length > 20);
      });
      it('does not give the answer away as one line of the goal', () => {
        if (typeof m.answer === 'string') assert.ok(!plain(m.goal).includes(m.answer), 'the goal must not contain the answer');
      });
    });
  }));
});

describe('prompt form fields are shown only once a mission has taught them', () => {
  // field -> the first mission (chapter 1) whose card teaches it
  const TAUGHT = { donewhen: 0, constraints: 1, files: 2 };
  const prompts = AQ.CH[0].missions.map((m, i) => [m, i]).filter(([m]) => m.kind === 'prompt');
  it('every prompt mission lists its fields, and chapter 1 never shows Use, Plan, Examples or Extra', () => {
    for (const [m] of prompts) {
      assert.ok(Array.isArray(m.fields) && m.fields.includes('goal'), m.title);
      for (const hidden of ['use', 'plan', 'examples', 'extra']) assert.ok(!m.fields.includes(hidden), `${m.title} shows ${hidden}`);
    }
  });
  it('a field appears from the mission that teaches it onward, and not before', () => {
    for (const [m, i] of prompts) for (const [f, from] of Object.entries(TAUGHT)) assert.equal(m.fields.includes(f), i >= from, `${i} ${f}`);
  });
  it('the reference, wrong and lazy answers only use fields the mission shows', () => {
    const names = { goal: 'goal', files: 'files', examples: 'examples', use: 'use', plan: 'plan', constraints: 'constraints', donewhen: 'donewhen', extra: 'extra' };
    for (const [m] of prompts) for (const x of [m.answer, m.wrong, m.lazy]) {
      const f = AQ.config.splitFields(x).fields;
      const used = Object.keys(names).filter((k) => (Array.isArray(f[k]) ? f[k].length : k === 'plan' ? f[k] : f[k] !== '' && f[k] !== null));
      for (const k of used) assert.ok(m.fields.includes(k), `${m.title}: ${k}`);
    }
  });
});

describe('chapter 1: lazy and nearby answers are caught', () => {
  it('1.1 Done when must be a check that tests the fix', () => {
    for (const a of ['Done when: read src/price.js', 'Done when: it is done', 'Done when: run npm run lint', 'Done when: run ghost', '']) assert.equal(typeof run(0, 0, a), 'string', a);
    assert.equal(run(0, 0, 'Done when: run npm test\nFiles: src/price.js'), true);
  });
  it('1.1 a rule that stops the fix fails even with the right check', () => assert.equal(typeof run(0, 0, 'Done when: run npm test\nConstraints: do not edit src/'), 'string'));
  it('1.1 the agent fixes its own first mistake only because the check ran', () => {
    const { outcome } = AQ.evaluate(M(0, 0), M(0, 0).answer);
    assert.equal(outcome.status, 'done');
    assert.ok(outcome.steps.some((s) => s.tag === 'fix'));
    assert.equal(AQ.evaluate(M(0, 0), M(0, 0).lazy).outcome.status, 'unverified');
  });
  it('1.2 the right rule can be written more than one way', () => {
    for (const a of ['Constraints: do not delete data/backup.csv', 'Constraints: do not delete data', 'Constraints: do not delete data/\nConstraints: do not read data/']) assert.equal(run(0, 1, a), true, a);
  });
  it('1.2 rules that parse but do not stop the delete, or that cannot resolve, fail', () => {
    for (const a of ['Constraints: do not delete nonexistent/', 'Constraints: only edit src/price.js', 'Constraints: do not edit data/', 'Constraints: do not delete src/util.js', 'Constraints: do not remove data/', 'Constraints: do not delete ../data/']) assert.equal(typeof run(0, 1, a), 'string', a);
  });
  it('1.2 a rejected line means the agent is not run at all', () => {
    const r = AQ.evaluate(M(0, 1), "Constraints: be careful and don't delete anything");
    assert.equal(r.refused, true);
    assert.equal(r.outcome, null);
    assert.match(r.result, /was not run/);
    assert.equal(r.prompt.errors.length, 1);
    const ok = AQ.evaluate(M(0, 1), 'Constraints: do not delete data/');
    assert.equal(ok.refused, undefined);
    assert.equal(ok.result, true);
  });
  it('1.2 one rejected line stops a run that would otherwise pass', () => {
    assert.equal(run(0, 1, 'Constraints: do not delete data/'), true);
    assert.match(run(0, 1, 'Constraints: do not delete data/\nConstraints: be careful'), /was not run/);
    assert.match(run(0, 1, 'Constraints: do not delete data/\nrandom words'), /was not run/);
  });
  it('1.2 a rule that parses but blocks nothing real still runs, and the delete is named', () => assert.match(run(0, 1, 'Constraints: do not read data/'), /nothing told it not to/));
  it('Plan: first pauses the run and approving finishes it, through the mission path', () => {
    const input = 'Plan: first\nDone when: run npm test';
    const paused = AQ.evaluate(M(0, 0), input);
    assert.equal(paused.awaiting, true);
    assert.equal(paused.outcome.status, 'awaiting-approval');
    assert.equal(typeof paused.result, 'string', 'a pause is not a pass');
    assert.equal(AQ.runMission(M(0, 0), input, { approved: true }), true);
  });
  it('1.3 a second small file is fine, a folder or a doc is too much, the wrong file never fixes', () => {
    assert.equal(run(0, 2, 'Files: src/price.js, src/util.js'), true);
    for (const a of ['Files: src/', 'Files: src/price.js\nFiles: docs/notes.md', 'Files: src/util.js', 'Files: nothing.js', 'Files: ../x']) assert.equal(typeof run(0, 2, a), 'string', a);
  });
  it('1.4 the rule in CLAUDE.md works and nothing else in the project can be edited to cheat', () => {
    assert.equal(run(0, 3, { files: { 'CLAUDE.md': 'do not delete data/' } }), true);
    assert.equal(typeof run(0, 3, { files: { 'src/price.js': 'Math.round(' } }), 'string');
    assert.equal(typeof run(0, 3, { prompt: 'Constraints: do not delete data/' }), 'string', 'the prompt of a config mission is fixed');
  });
  it('1.5 deleting the rule, or keeping the notes, fails; the one-line file passes', () => {
    assert.equal(run(0, 4, { files: { 'CLAUDE.md': 'do not delete data/' } }), true);
    assert.equal(run(0, 4, { files: { 'CLAUDE.md': 'do not delete data/\nPrices are in dollars.' } }), true);
    assert.equal(typeof run(0, 4, { files: { 'CLAUDE.md': '' } }), 'string', 'deleting everything fails');
    assert.match(run(0, 4, {}), /tokens/);
    assert.equal(typeof run(0, 4, { files: { 'CLAUDE.md': 'do not delete data/\n' + 'x'.repeat(2000) } }), 'string');
  });
  it('1.5 bulk moved into another setup file still counts, and a small rule file is a fair answer', () => {
    assert.equal(typeof run(0, 4, { files: { 'CLAUDE.md': '', '.claude/permissions.txt': 'deny delete data/\n' + 'x'.repeat(2000) } }), 'string');
    assert.equal(run(0, 4, { files: { 'CLAUDE.md': '', '.claude/permissions.txt': 'deny delete data/' } }), true);
  });
  it('the goal of 1.3 states the limit the scenario enforces', () => assert.ok(M(0, 2).goal.includes(` ${AQ.PEAK} tokens`)));
  it('the starting setup of 1.5 really is heavy', () => {
    const v = AQ.vfs.create(AQ.scenarios.bloated.vfs);
    assert.ok(AQ.context.setupTokens(AQ.config.parseSetup(v)) > 500);
  });
});

describe('facts', () => {
  it('each fact has an id, text, https docUrl and an ISO checked date', () => {
    const ids = new Set();
    for (const f of AQ.FACTS) {
      assert.ok(f.id && !ids.has(f.id)); ids.add(f.id);
      assert.ok(f.text.trim());
      assert.match(f.docUrl, /^https:\/\/\S+$/);
      assert.match(f.checked, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(!Number.isNaN(Date.parse(f.checked + 'T00:00:00Z')), f.checked);
    }
  });
  it('oldest and stale are pure: the caller passes the time', () => {
    const fs = [{ checked: '2026-01-10' }, { checked: '2025-12-01' }, { checked: '2026-03-01' }];
    assert.equal(AQ.facts.oldest(fs).checked, '2025-12-01');
    assert.equal(AQ.facts.oldest([]), null);
    const at = (d) => Date.parse(d + 'T00:00:00Z');
    assert.equal(AQ.facts.stale(fs, at('2026-02-28')), false);
    assert.equal(AQ.facts.stale(fs, at('2026-03-05')), true);
    assert.equal(AQ.facts.stale([], at('2030-01-01')), false);
  });
});

describe('extras', () => {
  it('quick-fire has at least three questions per chapter with three wrong answers each', () => {
    for (const ch of AQ.CH.keys()) assert.ok(AQ.QF.filter((q) => q.ch === ch).length >= 3, `chapter ${ch + 1}`);
    for (const q of AQ.QF) {
      assert.ok(q.ch >= 0 && q.ch < AQ.CH.length);
      assert.equal(q.w.length, 3);
      assert.ok(!q.w.includes(q.a));
      assert.ok(q.c && q.a && q.why);
    }
  });
  it('the field guide has an entry per chapter and its examples are read-only text', () => {
    for (const ch of AQ.CH.keys()) assert.ok(AQ.GUIDE.some((g) => g.ch === ch), `chapter ${ch + 1}`);
    for (const g of AQ.GUIDE) {
      assert.ok(g.c && g.what);
      assert.ok(g.ex.length && g.ex.every((e) => Array.isArray(e) && typeof e[0] === 'string'));
    }
  });
  it('every guide example that is a prompt line parses against its own mission scenario', () => {
    const sc = AQ.scenarios.tidy;
    for (const g of AQ.GUIDE) for (const [t] of g.ex) {
      if (/^(Done when|Constraints|Files):/.test(t)) {
        const p = AQ.config.parsePrompt(t, { ...sc, commands: AQ.scenarios.price.commands }, AQ.config.parseSetup(AQ.vfs.create(sc.vfs)));
        assert.equal(p.errors.length, 0, t);
      }
    }
  });
});
