// The Intermediate tier raised Script Quest from 12 to 20 chapters: a save that finished the old 93 missions is no longer complete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScriptContent } from '../content-loader.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sandbox = {};
vm.createContext(sandbox);
for (const f of ['shared/catalog.js', 'shared/trophies.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
const T = sandbox.Trophies;
const plain = x => JSON.parse(JSON.stringify(x));
const { QUESTS, SUBJECTS } = plain(sandbox.Catalog);
const quest = QUESTS.find(q => q.key === 'script-quest-v1');
const { CH } = loadScriptContent();
const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/script-progress-complete.json'), 'utf8')).data;

const every = Object.fromEntries(CH.flatMap((c, i) => c.missions.map((_, j) => [`${i}-${j}`, 1])));
const finisher = stats => plain(T.achievements([stats], SUBJECTS)).find(a => a.id === 'finisher').earned;

test('the 93-mission save reads as 12 of the 20 chapters, not complete', () => {
  const s = plain(T.questStats(quest, old));
  assert.equal(s.chaptersDone, 12);
  assert.equal(s.chaptersTotal, CH.length);
  assert.equal(s.missionsDone, 93);
  assert.equal(s.missionsTotal, CH.reduce((n, c) => n + c.missions.length, 0));
  assert.equal(s.complete, false);
});

test('a save with every mission, new ones included, reads as complete', () => {
  const s = plain(T.questStats(quest, { xp: 0, done: every }));
  assert.equal(s.chaptersDone, CH.length);
  assert.equal(s.complete, true);
});

test('Finisher is lost for the old save and comes back once the new chapters are done', () => {
  assert.equal(finisher(T.questStats(quest, old)), false);
  assert.equal(finisher(T.questStats(quest, { done: every })), true);
});
