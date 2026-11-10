import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMath } from './harness.mjs';

const BASE = ['../math/vendor/mathjs/math.js', 'rng.js', 'graph.js', 'scene/palette.js', 'scene/model.js', 'scene/svg2d.js', 'input/mathjs-setup.js', 'input/check.js'];
const plain = x => JSON.parse(JSON.stringify(x));
const TRACKS = ['arithmetic', 'algebra', 'geometry', 'trigonometry'];

const stateOf = (MQ, def, params) => {
  const m = MQ.scene.model(def);
  for (const [k, v] of Object.entries(params)) m.set(k, v);
  return m.state();
};
const judge = (MQ, ch, m, v) => m.kind === 'scene' ? m.check(stateOf(MQ, m.scene || ch.scene, v)) : m.check(v);

for (const track of TRACKS) {
  const MQ = loadMath([...BASE, `${track}/content.js`]);
  const C = MQ.content;

  test(`${track}: chapter ids match graph.js, in order`, () => {
    assert.equal(C.track, track);
    assert.deepEqual(plain(C.chapters.map(c => c.id)), plain(MQ.graph.chapters[track].map(c => c.id)));
  });

  test(`${track}: every chapter has a scene, a badge, an intro and missions`, () => {
    for (const ch of C.chapters) {
      assert.ok(ch.scene && ch.scene.params && ch.scene.draw, `${ch.id} has no scene`);
      assert.ok(ch.name && ch.badge && ch.intro, ch.id);
      assert.ok(ch.missions.length >= 5, ch.id);
    }
  });

  test(`${track}: every story picture is a 2D drawing over a 2D scene and only uses built-in icons`, () => {
    const scenes = C.chapters.flatMap(ch => [ch.scene, ...ch.missions.map(m => m.scene)]).filter(sc => sc && sc.story);
    for (const sc of scenes) {
      assert.ok(sc.story.title && typeof sc.story.live === 'function', `${sc.id}: story needs a title and a live line`);
      assert.equal(sc.draw.kind, '2d', `${sc.id}: story needs a 2D scene`);
      assert.equal(sc.story.draw.kind, '2d', `${sc.id}: story draw`);
      assert.equal(typeof sc.story.draw.items, 'function', `${sc.id}: story draw has no items function`);
      const st = MQ.scene.model(sc).state();
      for (const it of sc.story.draw.items(st)) if (it.type === 'icon') assert.ok(MQ.svg2d.icons[it.name], `${sc.id}: unknown icon ${it.name}`);
      for (const it of sc.story.draw.items(st)) {
        assert.ok(['axes', 'grid', 'fn', 'polygon', 'text', 'vector', 'point', 'icon', 'rrect', 'circle'].includes(it.type), `${sc.id}: unknown item ${it.type}`);
        const nums = it.type === 'rrect' ? [it.x0, it.y0, it.x1, it.y1, it.r] : it.type === 'circle' ? [it.x, it.y, it.r] : [];
        for (const v of nums) assert.ok(Number.isFinite(v), `${sc.id}: ${it.type} needs finite numbers`);
        if (it.type === 'rrect') assert.ok(it.x1 > it.x0 && it.y1 > it.y0, `${sc.id}: rrect needs a positive size`);
      }
      for (const it of sc.story.draw.items(st)) if (it.alpha !== undefined) assert.ok(it.alpha > 0 && it.alpha <= 1, `${sc.id}: alpha ${it.alpha}`);
    }
  });

  if (track === 'arithmetic') test('arithmetic: every 2D scene has a story picture', () => {
    const scenes = C.chapters.flatMap(ch => [ch.scene, ...ch.missions.map(m => m.scene)]).filter(sc => sc && sc.draw.kind === '2d');
    for (const sc of scenes) assert.ok(sc.story, `${sc.id} has no story picture`);
  });

  if (track === 'algebra') test('algebra: every 2D scene has a story picture', () => {
    const scenes = C.chapters.flatMap(ch => [ch.scene, ...ch.missions.map(m => m.scene)]).filter(sc => sc && sc.draw.kind === '2d');
    for (const sc of scenes) assert.ok(sc.story, `${sc.id} has no story picture`);
  });

  test(`${track}: a story picture keeps the plain picture's x-range, vectors and points where they are`, () => {
    const corners = sc => Object.keys(sc.params).reduce((acc, n) => acc.flatMap(p => [...new Set([sc.params[n].min, sc.params[n].value, sc.params[n].max])].map(v => ({ ...p, [n]: v }))), [{}]);
    const key = it => JSON.stringify(it.type === 'vector' ? [it.type, it.from, it.to, it.term] : [it.type, it.x, it.y, it.term]);
    const scenes = C.chapters.flatMap(ch => [ch.scene, ...ch.missions.map(m => m.scene)]).filter(sc => sc && sc.story);
    for (const sc of scenes) {
      assert.deepEqual(plain(sc.story.draw.view.slice(0, 2)), plain(sc.draw.view.slice(0, 2)), `${sc.id}: x-range differs`);
      for (const params of corners(sc)) {
        const m = MQ.scene.model(sc);
        for (const [k, v] of Object.entries(params)) m.set(k, v);
        const st = m.state(), inStory = new Set(sc.story.draw.items(st).map(key));
        for (const it of sc.draw.items(st)) if (it.type === 'vector' || it.type === 'point') assert.ok(inStory.has(key(it)), `${sc.id} ${JSON.stringify(params)}: story lacks ${key(it)}`);
      }
    }
  });

  C.chapters.forEach((ch, ci) => ch.missions.forEach((m, mi) => {
    const id = `${track} ${ci}.${mi} ${m.title}`;
    test(`${id}: answer passes, wrong and lazy fail`, () => {
      for (const f of ['title', 'goal', 'explain', 'hint', 'kind']) assert.ok(m[f], `${id} has no ${f}`);
      assert.ok(['number', 'expr', 'equation', 'scene'].includes(m.kind), id);
      assert.ok(Array.isArray(m.how) && m.how.length >= 3 && m.how.length <= 5, `${id}: how has 3 to 5 steps`);
      for (const f of ['answer', 'wrong', 'lazy']) assert.ok(m[f] !== undefined, `${id} has no ${f}`);
      assert.equal(judge(MQ, ch, m, m.answer).ok, true, `${id}: answer fails: ${judge(MQ, ch, m, m.answer).why}`);
      assert.equal(judge(MQ, ch, m, m.wrong).ok, false, `${id}: wrong passes`);
      const lazy = judge(MQ, ch, m, m.lazy);
      assert.equal(lazy.ok, false, `${id}: lazy passes`);
      assert.ok(lazy.why, `${id}: lazy fails without saying why`);
    });

    if (m.scene) test(`${id}: its own scene is complete`, () => assert.ok(m.scene.params && m.scene.draw && m.scene.title, id));
    const ans = /^(?:[a-z]\s*=\s*)?(-?\d+(?:\.\d+)?)$/.exec(String(m.answer));
    // The chain shows its middle step 2 − 6 + 10; that 6 is 3 × 2, not the answer.
    const SAME_NUMBER = { 'arithmetic 0.3': '6' };
    if (m.kind !== 'scene' && ans && SAME_NUMBER[`${track} ${ci}.${mi}`] !== ans[1]) test(`${id}: the unsolved picture does not show the answer ${ans[1]}`, () => {
      const def = MQ.scene.forMission(ch, m, false, false), model = MQ.scene.model(def);
      if (def.t) model.set('t', def.t.max);
      const st = model.state(), drawn = def.draw.kind === '2d' ? def.draw.items(st).filter(i => i.type === 'text').map(i => i.s) : [];
      const text = [model.live(), model.describe(), ...drawn].join(' | ').replace(/−/g, '-');
      assert.doesNotMatch(text, new RegExp(`(?<![\\d.])${ans[1].replace('.', '\\.')}(?![\\d.])`), `${id}: ${text}`);
    });
    const sc = m.scene || ch.scene;
    if (m.kind !== 'scene' && ans && sc.story) test(`${id}: the unsolved story picture does not show the answer ${ans[1]}`, () => {
      const def = MQ.scene.forMission(ch, m, false, false), model = MQ.scene.model(def), st = model.state();
      const text = [def.story.live(st), ...def.story.draw.items(st).filter(i => i.type === 'text' && !/^[−\d]+°$/.test(i.s)).map(i => i.s)].join(' | ').replace(/−/g, '-');
      assert.doesNotMatch(text, new RegExp(`(?<![\\d.])${ans[1].replace('.', '\\.')}(?![\\d.])`), `${id}: ${text}`);
    });
    if (m.kind !== 'scene') test(`${id}: the explanation, shown before solving, does not state the answer`, () => {
      const flat = x => String(x).replace(/<[^>]+>/g, '').replace(/−/g, '-').replace(/[·×]/g, '*').replace(/²/g, '^2').replace(/\s+/g, '');
      const words = m.explain.replace(/<[^>]+>/g, '').replace(/−/g, '-'), a = String(m.answer);
      if (/[a-z(]/.test(a.replace(/^[a-z]=/, '').replace(/ or [a-z]=/g, ' '))) assert.ok(!flat(m.explain).includes(flat(a)), `${id}: ${words}`);
      else for (const n of a.match(/-?\d+(?:[./]\d+)?/g)) if (n !== '0')
        assert.doesNotMatch(words, new RegExp(`(?<![\\d./-])${n.replace(/[./]/g, '\\$&')}(?![\\d./a-z])`), `${id}: ${words}`);
    });
    if (m.reveal) test(`${id}: the reveal scene takes the mission's start values`, () => {
      const r = m.reveal === true ? ch.scene : m.reveal;
      for (const [k, x] of Object.entries({ ...m.at, ...m.revealAt })) assert.ok(r.params[k] && x >= r.params[k].min && x <= r.params[k].max, `${id}: ${k} = ${x} does not fit the reveal scene`);
    });
    if (m.at) test(`${id}: start values are params in range`, () => {
      for (const [k, x] of Object.entries(m.at)) {
        const p = (m.scene || ch.scene).params[k];
        assert.ok(p, `${id}: unknown param ${k}`);
        assert.ok(x >= p.min && x <= p.max && Math.abs((x - p.min) / (p.step || 1) - Math.round((x - p.min) / (p.step || 1))) < 1e-9, `${id}: ${k} = ${x} is out of range or off a step`);
      }
    });
    if (m.kind === 'scene') test(`${id}: scene answers are params in range`, () => {
      for (const v of [m.answer, m.wrong, m.lazy]) for (const [k, x] of Object.entries(v)) {
        const p = (m.scene || ch.scene).params[k];
        assert.ok(p, `${id}: unknown param ${k}`);
        assert.ok(x >= p.min && x <= p.max, `${id}: ${k} = ${x} is out of range`);
      }
    });
    else test(`${id}: the lazy answer is the question, and the step checker agrees with the answer`, () => {
      assert.equal(m.lazy, m.question, id);
      const opts = { kind: m.kind, vars: m.vars, round: m.round };
      assert.equal(MQ.check.steps(m.question, [m.answer], opts)[0].ok, true, `${id}: the step checker rejects the answer`);
      assert.equal(MQ.check.steps(m.question, [m.wrong], opts)[0].ok, false, `${id}: the step checker accepts the wrong answer`);
      if (m.work === 'required') {
        assert.ok(m.steps && m.steps.length > 1, `${id}: work is required, so the mission lists reference steps`);
        assert.deepEqual(plain(MQ.check.steps(m.question, m.steps, opts).map(r => r.ok)), plain(m.steps.map(() => true)));
        assert.equal(m.check(m.steps.at(-1)).ok, true);
      }
    });
  }));

  test(`${track}: quick-fire templates are repeatable for a seed and answer correctly`, () => {
    assert.ok(C.quickfire.length >= 1);
    for (const t of C.quickfire) {
      assert.ok(C.chapters[t.ch], 'quick-fire names a chapter');
      const five = () => { const r = MQ.rng(1); return Array.from({ length: 5 }, () => t.make(r)); };
      const a = plain(five());
      assert.deepEqual(a, plain(five()));
      assert.ok(new Set(a.map(q => q.q)).size > 1, 'the template varies');
      for (const q of a) {
        assert.ok(q.q && q.why, JSON.stringify(q));
        assert.equal(MQ.check.number(String(q.a), q.q).ok, true, `${q.q} = ${q.a}`);
      }
    }
  });

  test(`${track}: the field guide has entries for every chapter`, () => {
    C.chapters.forEach((ch, ci) => assert.ok(C.guide.filter(g => g.ch === ci).length >= 2, ch.id));
    for (const g of C.guide) assert.ok(g.title && g.what, JSON.stringify(g));
  });

  test(`${track}: ranks start at 0 XP and climb`, () => {
    assert.equal(C.ranks[0][0], 0);
    for (let i = 1; i < C.ranks.length; i++) assert.ok(C.ranks[i][0] > C.ranks[i - 1][0]);
  });

  test(`${track}: the top rank is reached exactly when every mission and badge is earned`, () => {
    // 10 XP per mission (track.js) and 25 per chapter badge (shared/tiers.js BADGE_XP).
    const full = C.chapters.reduce((xp, ch) => xp + ch.missions.length * 10 + 25, 0);
    assert.equal(C.ranks.at(-1)[0], full);
  });
}

const GEO = {
  'geometry.area': [
    { yes: ['84', ' 84 ', '84.0'], no: ['38', '19', '84 squares', '12+7'] },
    { yes: ['45', '45.0', ' 45'], no: ['90', '19', '10*9/2'] },
    { yes: ['68', '68.0'], no: ['80', '36', '56'] },
    { yes: ['6', '6.0', ' 6 '], no: ['45', '63', '486'] },
    { yes: [{ b: 4, h: 6 }, { b: 6, h: 4, p: 7 }, { b: 6, h: 4, p: 0 }], no: [{ b: 8, h: 3 }, { b: 5, h: 5 }, { b: 6, h: 5 }] },
  ],
  'geometry.angles': [
    { yes: ['133', '133°', ' 133 °', '133.0'], no: ['43', '227', '47°', '°133', '133°°'] },
    { yes: ['75', '75°'], no: ['285', '-105', '105°'] },
    { yes: ['51', '51°'], no: ['231', '129', '129°'] },
    { yes: ['38', '38°'], no: ['76', '104', '142°'] },
    { yes: [{ r1: 60, r2: 120 }, { r1: 120, r2: 60 }], no: [{ r1: 60, r2: 100 }, { r1: 90, r2: 90 }, { r1: 60, r2: 60 }] },
  ],
  'geometry.pythagoras': [
    { yes: ['5', '5.0', ' 5 '], no: ['25', '7', '3^2+4^2', '5.1'] },
    { yes: ['10', '10.0'], no: ['100', '14', '28'] },
    { yes: ['12', '12.0'], no: ['144', '8', '194'] },
    { yes: ['8.6', ' 8.6 '], no: ['8.60', '8', '9', '8.7', '8.602', '74', '74.0'] },
    { yes: [{ a: 6, b: 8 }, { a: 8, b: 6 }], no: [{ a: 3, b: 4 }, { a: 4, b: 4 }, { a: 5, b: 7 }] },
  ],
  'geometry.circles': [
    { yes: ['31.4', ' 31.4 '], no: ['31.40', '31', '31.3', '15.7', '31.41', '62.8'] },
    { yes: ['28.3'], no: ['28.30', '28', '28.2', '18.8', '9'] },
    { yes: ['153.9'], no: ['154', '153.94', '615.8', '153.8'] },
    { yes: ['4.8'], no: ['4.80', '4.7', '5', '15.0', '4.77'] },
    { yes: [{ r: 5 }], no: [{ r: 4 }, { r: 4.5 }, { r: 5.5 }, { r: 3 }] },
  ],
};
{
  const MQ = loadMath([...BASE, 'geometry/content.js']);
  for (const ch of MQ.content.chapters) GEO[ch.id].forEach((alt, mi) => {
    const m = ch.missions[mi];
    test(`geometry ${ch.id} ${mi} ${m.title}: other right answers pass and slips fail`, () => {
      for (const v of alt.yes) assert.equal(judge(MQ, ch, m, v).ok, true, `${JSON.stringify(v)} should pass: ${judge(MQ, ch, m, v).why}`);
      for (const v of alt.no) {
        const r = judge(MQ, ch, m, v);
        assert.equal(r.ok, false, `${JSON.stringify(v)} should fail`);
        assert.ok(r.why, `${JSON.stringify(v)} fails without saying why`);
      }
    });
  });
}
const TRIG = {
  'trigonometry.ratios': [
    { yes: ['5.7', '5.7°', ' 5.7 '], no: ['5.736', '5.74', '6', '8.2', '10*sin(35)', '5.80'] },
    { yes: ['9.2', ' 9.2 '], no: ['9.19', '9', '7.7', '12*cos(40)'] },
    { yes: ['4.6', ' 4.6'], no: ['4.62', '5', '13.9', '8*tan(30)'] },
    { yes: ['30', '30°', ' 30 °', '30.0'], no: ['0.5', '60', '5/10', 'asin(5/10)=30'] },
    { yes: [{ ang: 45, hyp: 10 }, { ang: 45, hyp: 4 }], no: [{ ang: 30, hyp: 10 }, { ang: 40, hyp: 10 }, { ang: 50, hyp: 7 }] },
  ],
};
{
  const MQ = loadMath([...BASE, 'trigonometry/content.js']);
  for (const ch of MQ.content.chapters) TRIG[ch.id].forEach((alt, mi) => {
    const m = ch.missions[mi];
    test(`trigonometry ${ch.id} ${mi} ${m.title}: other right answers pass and slips fail`, () => {
      for (const v of alt.yes) assert.equal(judge(MQ, ch, m, v).ok, true, `${JSON.stringify(v)} should pass: ${judge(MQ, ch, m, v).why}`);
      for (const v of alt.no) {
        const r = judge(MQ, ch, m, v);
        assert.equal(r.ok, false, `${JSON.stringify(v)} should fail`);
        assert.ok(r.why, `${JSON.stringify(v)} fails without saying why`);
      }
    });
  });
}
const ALT = {
  'algebra.expanding': [
    { yes: ['3x+6', '6+3x', '3*x+6', '3x + 6'], no: ['3x+2', '3x+5', 'x+6', '3(x+2)'] },
    { yes: ['-2x+8', '8-2x', '-2*x+8', '8 - 2x'], no: ['-2x-8', '-2x-4', '2x+8', '-(2x-8)'] },
    { yes: ['x^2+4x+3', '3+4x+x^2', 'x*x+4x+3'], no: ['x^2+3', 'x^2+4x+4', 'x(x+3)+x+3', 'x^2+x+3x+3'] },
    { yes: ['x^2+4x+4', '4+4x+x^2', 'x*x+4x+4'], no: ['x^2+4', 'x^2+2x+4', '(x+2)(x+2)', 'x^2+2x+2x+4'] },
  ],
  'algebra.linear': [
    { yes: ['x=4', '4=x', 'x = 4', ' x=4 '], no: ['x=7', 'x=8', '2x=8', 'x=4.1'] },
    { yes: ['x=4', '4 = x', 'x=8/2'], no: ['x=2', 'x=3', '2x=8'] },
    { yes: ['x=6', '6=x', 'x=6.0'], no: ['x=1.5', 'x=3', 'x=5'] },
    { yes: ['x=5/3', '5/3=x', 'x = 5/3', 'x=10/6'], no: ['x=3', 'x=1.67', 'x=5', '3x=5'] },
  ],
  'algebra.factoring': [
    { yes: ['3(2x+3)', '3(3+2x)', '(2x+3)*3', '3*(2x+3)'], no: ['3(2x+9)', '1*(6x+9)', '6(x+3/2)', '3*2x+9', '2(3x+4.5)', '6(x+1.5)'] },
    { yes: ['(x+2)(x+3)', '(x+3)(x+2)', '(2+x)(3+x)', '(x+2)*(x+3)'], no: ['(x+1)(x+6)', 'x(x+5)+6', '(x-2)(x-3)', '(2x+4)(0.5x+1.5)'] },
    { yes: ['(x-3)(x+3)', '(x+3)(x-3)', '(3+x)(x-3)', '(x+3)*(x-3)'], no: ['(x-3)^2', '(x-9)(x+1)', 'x^2-3^2'] },
    { yes: ['(x-2)^2', '(x-2)(x-2)', '(2-x)^2', '(x-2)*(x-2)'], no: ['(x+2)^2', '(x-4)(x+1)', 'x(x-4)+4'] },
  ],
  'algebra.quadratics': [
    { yes: ['x=-2 or x=-3', 'x=-3 or x=-2', 'x=-2, x=-3', '-2=x or -3=x'], no: ['x=2 or x=3', 'x=-2', 'x=-2 or x=-3 or x=1', '(x+2)(x+3)=0'] },
    { yes: ['x=4 or x=-4', 'x=-4, x=4', 'x = 4 or x = -4'], no: ['x=4', 'x=16', 'x=4 or x=4'] },
    { yes: ['x=0 or x=3', 'x=3 or x=0', 'x=0,x=3'], no: ['x=3', 'x=0', 'x=-3 or x=0'] },
    { yes: ['x=3', '3=x', 'x = 3'], no: ['x=3 or x=3', 'x=-3', 'x=3 or x=-3'] },
  ],
};
{
  const MQ = loadMath([...BASE, 'algebra/content.js']);
  for (const [id, rows] of Object.entries(ALT)) rows.forEach((row, mi) => test(`algebra ${id} ${mi}: other right answers pass and slips fail with a reason`, () => {
    const ch = MQ.content.chapters.find(c => c.id === id);
    assert.ok(ch, `${id} has content`);
    const m = ch.missions[mi], opts = { kind: m.kind, vars: m.vars };
    for (const v of row.yes) {
      assert.equal(m.check(v).ok, true, `${v}: ${m.check(v).why}`);
      assert.equal(MQ.check.steps(m.question, [v], opts)[0].ok, true, `${v} as a step`);
    }
    for (const v of row.no) {
      const r = m.check(v);
      assert.equal(r.ok, false, `${v} passes`);
      assert.ok(r.why, `${v} fails without a reason`);
    }
  }));
}
const MORE = {
  'arithmetic.negatives': [
    { yes: ['-8', ' -8 ', '-8.0'], no: ['8', '-2', '2'] },
    { yes: ['8', ' 8', '8.0'], no: ['-8', '-6', '-4*-2', '(-4)*(-2)'] },
    { yes: ['-4', '-4.0'], no: ['4', '-9', '-36'] },
    { yes: ['9', ' 9 '], no: ['-11', '21', '3'] },
    { yes: [{ a: -3, b: -4 }, { a: -4, b: -3 }], no: [{ a: -3, b: 4 }, { a: 4, b: -3 }, { a: -4, b: -4 }] },
  ],
  'arithmetic.fractions': [
    { yes: ['7/12', ' 7 / 12 ', '7/ 12'], no: ['2/7', '14/24', '0.5833', '7/13'] },
    { yes: ['8/15', '8 / 15'], no: ['6/8', '10/12', '0.5333', '16/30'] },
    { yes: ['3/4', ' 3/4 '], no: ['9/12', '6/8', '1/3', '0.75'] },
    { yes: ['2/3', '2 / 3'], no: ['1/2', '4/6', '0.667'] },
    { yes: [{ a: 4, b: 6, n: 12 }, { a: 6, b: 4, n: 12 }], no: [{ a: 4, b: 6, n: 24 }, { a: 4, b: 6, n: 10 }, { a: 4, b: 3, n: 12 }] },
  ],
  'arithmetic.powers': [
    { yes: ['8', '8.0'], no: ['6', '9', '2*2*2'] },
    { yes: ['0', ' 0 '], no: ['8', '-8', '4'] },
    { yes: ['7', '7.0'], no: ['24.5', '49', '-7'] },
    { yes: ['243'], no: ['729', '3^5', '45'] },
    { yes: [{ n: 8 }], no: [{ n: 7 }, { n: 9 }] },
  ],
  'arithmetic.ratios': [
    { yes: ['2/3', '2 / 3'], no: ['6/9', '4/6', '3/2'] },
    { yes: ['21', '21.0'], no: ['14', '17.5', '7'] },
    { yes: ['12', '12.0'], no: ['1200', '65', '0.12'] },
    { yes: ['50'], no: ['10', '65', '1000'] },
    { yes: [{ a: 2, b: 3 }, { a: 4, b: 6 }, { a: 6, b: 9 }], no: [{ a: 3, b: 2 }, { a: 1, b: 1 }, { a: 4, b: 5 }] },
  ],
};
const STEPS = {
  'arithmetic.negatives': [['-8'], ['8'], ['-4'], ['8+7+(-6)', '15-6', '9']],
  'arithmetic.fractions': [['3/12+4/12', '7/12'], ['8/15'], ['9/12', '3/4'], ['1/2+6/12-1/3', '1/2+1/2-1/3', '1-1/3', '3/3-1/3', '2/3']],
  'arithmetic.powers': [['2*2*2', '4*2', '8'], ['-4+4', '0'], ['7'], ['9*27', '3^5', '243']],
  'arithmetic.ratios': [['6/9', '2/3'], ['35/5*3', '7*3', '21'], ['80/100*15', '0.15*80', '0.8*15', '12'], ['40+40*25/100', '40+10', '1.25*40', '50']],
};

{
  const MQ = loadMath([...BASE, 'arithmetic/content.js']);
  const C = MQ.content;
  for (const [id, rows] of Object.entries(MORE)) test(`${id}: other right answers pass and slips fail`, () => {
    const ci = C.chapters.findIndex(c => c.id === id), ch = C.chapters[ci];
    assert.ok(ch, `${id} has content`);
    assert.ok(C.quickfire.some(q => q.ch === ci), `${id} has a quick-fire template`);
    assert.equal(C.guide.filter(g => g.ch === ci).length, 2, `${id} has 2 guide entries`);
    rows.forEach((r, mi) => {
      const m = ch.missions[mi];
      for (const v of r.yes) assert.equal(judge(MQ, ch, m, v).ok, true, `${id} ${mi}: ${JSON.stringify(v)} should pass: ${judge(MQ, ch, m, v).why}`);
      for (const v of r.no) {
        const res = judge(MQ, ch, m, v);
        assert.equal(res.ok, false, `${id} ${mi}: ${JSON.stringify(v)} should fail`);
        assert.ok(res.why, `${id} ${mi}: ${JSON.stringify(v)} fails without saying why`);
      }
      if (STEPS[id] && STEPS[id][mi]) assert.deepEqual(plain(MQ.check.steps(m.question, STEPS[id][mi]).map(x => x.ok)), STEPS[id][mi].map(() => true), `${id} ${mi} working`);
    });
  });

  test('arithmetic.fractions: an unsimplified answer is told how to simplify', () => {
    const m = C.chapters.find(c => c.id === 'arithmetic.fractions').missions[2];
    assert.match(m.check('9/12').why, /Divide the top and bottom by the same number/);
  });
}

test('algebra: an unsolved quadratic shows the curve without its crossing dots or x-axis numbers, and the solved one shows both', () => {
  const MQ = loadMath([...BASE, 'algebra/content.js']);
  const ch = MQ.content.chapters.find(c => c.id === 'algebra.quadratics');
  for (const m of ch.missions.filter(x => x.kind !== 'scene')) {
    const items = solved => { const def = MQ.scene.forMission(ch, m, false, solved); return def.draw.items(MQ.scene.model(def).state()); };
    const before = items(false), after = items(true);
    assert.ok(before.some(i => i.type === 'fn'), m.title);
    assert.equal(before.filter(i => i.type === 'point').length, 0, m.title);
    assert.equal(before.find(i => i.type === 'axes').xTicks, false, m.title);
    assert.ok(after.some(i => i.type === 'point') && after.find(i => i.type === 'axes').xTicks !== false, m.title);
  }
});
