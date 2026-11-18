// Script Quest Intermediate chapters: structure only. Whether each mission is solved by its own code runs in the real page (tests/smoke.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadScriptContent } from '../content-loader.mjs';

// the real Node engine on a fresh project, with a vm context standing in for the page's realm
globalThis.JSRealm = { runScript: (R, code) => { try { vm.runInContext(code, R.w); return null; } catch (e) { return e; } } };
await import('../../shared/nodeenv.js');

const SCQ = loadScriptContent();
const CH = SCQ.CH;
const INTERMEDIATE = CH.filter(c => c.tier === 'intermediate');
const first = CH.findIndex(c => c.tier === 'intermediate');

describe('script-quest intermediate chapters', () => {
  it('they come right after the 12 beginner chapters, in one block', () => {
    assert.equal(first, 12);
    assert.equal(INTERMEDIATE.length, 7);
    CH.slice(first).forEach(c => assert.equal(c.tier, 'intermediate'));
    CH.slice(0, first).forEach(c => assert.equal(c.tier, 'beginner'));
  });

  INTERMEDIATE.forEach(ch => {
    describe(ch.name, () => {
      it('has the chapter fields', () => {
        assert.equal(ch.group, 'JavaScript in depth');
        for (const k of ['name', 'badge', 'story', 'intro']) assert.ok(typeof ch[k] === 'string' && ch[k].trim(), `${ch.name}: ${k}`);
        assert.ok(['js', 'sh'].includes(ch.mode));
        assert.ok(Array.isArray(ch.learned) && ch.learned.length >= 3);
        assert.ok(ch.missions.length >= 4 && ch.missions.length <= 8, `${ch.name}: ${ch.missions.length} missions`);
      });

      ch.missions.forEach((m, i) => it(`mission ${i + 1} (${m.title}) is complete`, () => {
        for (const k of ['title', 'goal', 'explain', 'code']) assert.ok(typeof m[k] === 'string' && m[k].trim(), k);
        assert.equal(typeof m.check, 'function');
        assert.ok(Array.isArray(m.how) && m.how.length >= 3 && m.how.length <= 5, 'how: 3 to 5 steps');
        m.how.forEach(s => assert.ok(typeof s === 'string' && s.trim()));
        assert.ok(Array.isArray(m.anat) && m.anat.length >= 2);
        m.anat.forEach(a => assert.ok(a.length >= 2 && a.every(x => typeof x === 'string')));
        if (m.need) assert.ok(m.pre, 'a mission with need also has pre');
        assert.doesNotMatch([m.goal, m.explain, ...m.how].join(' '), /\b(simply|just|obviously|easy|easily)\b/i);
      }));
    });
  });

  describe('Modules stands alone', () => {
    const mod = CH.find(c => c.name === 'Modules');
    const chapter12 = CH[11];
    const taken = new Set(['read.js', 'todo.txt', 'math.js', 'app.js', 'greet.js', 'package.json', 'cow.js', ...chapter12.missions.map(m => m.editFile).filter(Boolean)]);
    const named = m => [m.editFile, ...(m.run || m.code).match(/[\w-]+\.(js|json|txt)\b|\.\/[\w-]+/g) || []].filter(Boolean).map(n => n.replace(/^\.\//, ''));

    it('is a shell chapter that follows the Node.js chapter\'s file names, not its files', () => {
      assert.equal(mod.mode, 'sh');
      assert.equal(chapter12.name, 'Node.js');
      mod.missions.forEach(m => named(m).forEach(n => {
        assert.ok(!taken.has(n) && !taken.has(n + '.js'), `${m.title} uses ${n}, which chapter 12 creates`);
      }));
    });

    it('has no setup: no need or pre on any mission', () => mod.missions.forEach(m => assert.ok(!m.need && !m.pre, m.title)));

    {
      const play = (m, extra = {}) => {
        const files = { 'hello.js': 'console.log("Welcome backstage!")\n', 'notes.txt': 'notes\n' };
        if (m.editFile) files[m.editFile] = m.code + '\n';
        const src = m.run || m.code;
        const code = src.match(/^node -e "([^]*)"$/)[1];
        const out = [];
        const R = { w: vm.createContext({ console: { log: (...a) => out.push(a.join(' ')) } }) };
        const vfs = { files, write: (k, v) => { files[k] = v; }, list: () => Object.keys(files), remove: k => { delete files[k]; }, hasModules: () => false, installed: () => false };
        const env = globalThis.NodeEnv.make(R, vfs, '[eval]', [], { out: () => {} });
        let ok = true;
        try { env.loadModule('[eval]', code); } catch (e) { ok = false; }
        return { cmd: 'node', args: ['-e', code], src, ok, out, logs: out, files, ...extra };
      };
      mod.missions.forEach(m => it(`mission "${m.title}": its own file and command complete it on a fresh project`, () => assert.ok(m.check(play(m)))));
      mod.missions.forEach(m => it(`mission "${m.title}": the unrelated inputs do not complete it`, () => {
        const files = { 'hello.js': '', 'notes.txt': '' };
        for (const [cmd, args, out] of [['ls', [], ['hello.js  notes.txt']], ['node', ['-v'], ['v22.12.0']], ['node', ['-e', '1'], []], ['npm', ['-v'], ['10.9.2']], ['echo', ['lazy'], ['lazy']]]) {
          assert.ok(!m.check({ cmd, args, src: [cmd, ...args].join(' '), ok: true, out, logs: out, files }), `${m.title}: ${cmd} ${args.join(' ')}`);
        }
      }));
    }
  });

  describe('quick-fire', () => {
    const { FIRE, qfOpen } = SCQ;
    const allDone = n => { const d = {}; CH.slice(0, n).forEach((c, i) => c.missions.forEach((_, j) => (d[`${i}-${j}`] = 1))); return d; };

    it('every new chapter has at least 2 questions', () => {
      for (let i = first; i < CH.length; i++) assert.ok(FIRE.filter(q => q.ch === i).length >= 2, `${CH[i].name}: ${FIRE.filter(q => q.ch === i).length}`);
    });

    it('qfOpen without a tier behaves as before', () => {
      const d = allDone(CH.length);
      assert.equal(qfOpen(d).length, FIRE.length);
      assert.equal(qfOpen(d, undefined).length, FIRE.length);
      assert.equal(qfOpen(allDone(first)).length, FIRE.filter(q => q.ch < first).length);
    });

    it('qfOpen with a tier keeps only that tier\'s open questions', () => {
      const d = allDone(CH.length);
      const inter = qfOpen(d, 'intermediate');
      assert.equal(inter.length, FIRE.filter(q => q.ch >= first).length);
      assert.ok(inter.every(q => CH[q.ch].tier === 'intermediate'));
      const beg = qfOpen(d, 'beginner');
      assert.equal(beg.length, FIRE.filter(q => q.ch < first).length);
      assert.equal(qfOpen(allDone(first), 'intermediate').length, 0);
      assert.equal(qfOpen({}, 'beginner').length, 0);
    });
  });

  it('the Script Quest landing card says how many chapters there are', () => {
    const html = fs.readFileSync(new URL('../../programming/index.html', import.meta.url), 'utf8');
    const m = html.match(/<h2>Script Quest<\/h2><div class="sub">([^<]*)<\/div>/);
    assert.ok(m, 'Script Quest card not found');
    assert.equal(m[1], `${CH.length} chapters`);
  });
});

describe('virtual Node.js without the Scheduler global', () => {
  it('sync fs and process.exit still work', () => {
    const files = {};
    const out = [];
    const R = { w: vm.createContext({ console: { log: (...a) => out.push(a.join(' ')) } }) };
    const vfs = { files, write: (k, v) => { files[k] = v; }, list: () => Object.keys(files), remove: k => { delete files[k]; }, hasModules: () => false, installed: () => false };
    const env = globalThis.NodeEnv.make(R, vfs, 'a.js', [], { out: () => {} });
    let exit;
    try {
      env.loadModule('a.js', "const fs=require('fs');fs.writeFileSync('a.txt','x');console.log(fs.readFileSync('a.txt','utf8'));process.exit(3)");
    } catch (e) { exit = e.__exit; }
    assert.equal(globalThis.Scheduler, undefined);
    assert.deepEqual(out, ['x']);
    assert.equal(exit, 3);
  });
});

describe('script-quest Field guide tier filter', () => {
  const { BLOCKS, guideHTML } = SCQ;
  const esc = s => String(s), hl = s => s;
  const tiers = [{ id: 'beginner', name: 'Beginner' }, { id: 'intermediate', name: 'Intermediate' }];
  const tierOf = i => tiers.find(t => t.id === CH[i].tier);
  const html = guideHTML({ esc, hl, tiers, tierOf });

  it('every block with a chapter index points at an Intermediate chapter, and each chapter has one', () => {
    const tagged = BLOCKS.filter(b => b[3] != null);
    assert.ok(tagged.every(b => CH[b[3]].tier === 'intermediate'));
    for (let c = first; c < CH.length; c++) assert.ok(tagged.some(b => b[3] === c), `chapter ${c + 1} has no guide block`);
  });

  it('the filter lists All plus each tier, and the Intermediate section holds exactly the tagged blocks', () => {
    assert.match(html, /<div class="gfilter"[^>]*><button[^>]*data-tier="all"[^>]*aria-pressed="true">All<\/button><button[^>]*data-tier="beginner"[^>]*>Beginner<\/button><button[^>]*data-tier="intermediate"[^>]*>Intermediate<\/button>/);
    const sec = html.match(/<section class="gsec gtier" data-tier="intermediate">([^]*?)<\/section>/)[1];
    assert.equal(sec.match(/data-run="/g).length, BLOCKS.filter(b => b[3] != null).length);
  });

  it('the Beginner blocks keep their indexes, and the error glossary is an extra', () => {
    const beginner = html.match(/<h3>Building blocks<\/h3>([^]*?)<\/section>/)[1];
    BLOCKS.forEach((b, i) => assert.equal(beginner.includes(`data-run="${i}"`), b[3] == null, b[0]));
    assert.match(html, /<section class="gsec" data-extras><h3>Error decoder/);
  });

  it('with no tier list there is no filter and no Intermediate section', () => {
    const plain = guideHTML({ esc, hl });
    assert.doesNotMatch(plain, /gfilter|data-tier="intermediate"/);
  });
});
