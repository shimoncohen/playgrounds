// Algebra track content (DOM-free). Chapter ids and order must match MQ.graph.chapters.algebra.
(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};
  const ok = { ok: true };
  const oneNumber = /^\s*-?\d+(\.\d+)?\s*$/;
  const finalNumber = value => v => !oneNumber.test(v) ? { ok: false, why: 'Keep going until your last line is one number.' } : MQ.check.number(v, value);
  const E = (label, value) => ({ min: 1, max: 6, step: 1, value, label });

  const box = {
    id: 'box-volume', title: 'Box volume',
    params: { a: E('length', 2), b: E('width', 3), c: E('height', 4) },
    derived: p => ({ V: p.a * p.b * p.c }),
    formula: 'V = \\term{a}{a}\\cdot\\term{b}{b}\\cdot\\term{c}{c}',
    live: 'V = {a}·{b}·{c} = {V}',
    draw: { kind: '3d', shape: 'box', size: p => [p.a, p.b, p.c] },
  };

  MQ.content = {
    track: 'algebra',
    ranks: [[0, 'Letter Learner'], [30, 'Box Builder'], [75, 'Volume Master']],
    chapters: [{
      id: 'algebra.expressions', name: 'Expressions and volume', badge: 'Volume Master',
      intro: 'In algebra, letters stand for numbers. A <b>variable</b> is a letter, like <code>a</code>, whose number can change. The box on this page has length <code>a</code>, width <code>b</code> and height <code>c</code>. Its <b>volume</b>, how many 1 by 1 by 1 cubes fit inside, is <code>V = a · b · c</code>, where the dot <code>·</code> means ×. A line made of numbers, letters and operations is an <b>expression</b>. Move the sliders and watch the box, the formula and the numbers change together.',
      scene: box,
      missions: [
        { title: 'Letters for numbers', kind: 'number', question: '10*5*3', tex: 'a \\cdot b \\cdot c \\;\\text{ with }\\; a = 10,\\ b = 5,\\ c = 3',
          goal: 'A crate is 10 long, 5 wide and 3 tall. Put those numbers in for the letters of <code>V = a · b · c</code> and work out the volume <code>V</code>.',
          how: [
            '<code>V = a · b · c</code> says: the volume is length times width times height. Each letter is a variable, waiting for its number.',
            '<code>a</code> is the length, 10; <code>b</code> is the width, 5; <code>c</code> is the height, 3. Swapping them in gives your first step, <code>10 · 5 · 3</code> (type <code>10*5*3</code>).',
            'Then multiply from left to right, as in Order of operations: <code>10 · 5</code> is 50, and <code>50 · 3</code> is 150.',
            'So 150 small cubes fit in the crate. Adding the edges, <code>10 + 5 + 3</code>, gives 18, which measures something else.',
          ],
          explain: 'The sliders in the scene change <code>a</code>, <code>b</code> and <code>c</code> on a smaller box. Each letter has one color: the same on its slider, in the formula and on its edges of the box.',
          hint: 'Swap each letter for its number: <code>10 · 5 · 3</code>. Then multiply.',
          answer: '150', wrong: '18', lazy: '10*5*3', check: finalNumber(150) },
        { title: 'One number in front', kind: 'expr', vars: ['c'], question: '5*2*c',
          goal: 'Another box is 5 long and 2 wide, but its height <code>c</code> can be anything. Its volume is <code>5 · 2 · c</code>. Write it with only one number in front of <code>c</code>.',
          how: [
            '<code>5 · 2 · c</code> multiplies three things: the two numbers can be multiplied now, and <code>c</code> waits until you know it.',
            '<code>5 · 2</code> is 10: numbers combine even with a letter next to them.',
            '<code>· c</code> stays as it is, because nobody has told you <code>c</code> yet.',
            'Write <code>10c</code>. A number right before a letter means they are multiplied, so <code>10c</code> is <code>10 · c</code>.',
          ],
          explain: 'To check an expression, the quest tries yours and the question with many different numbers for <code>c</code>. If they always agree, the two are equal.',
          hint: 'Multiply the numbers: what is <code>5 · 2</code>? Keep the <code>c</code>.',
          answer: '10c', wrong: '7c', lazy: '5*2*c',
          check: v => {
            const r = MQ.check.expr(v, '10c', { vars: ['c'] });
            if (!r.ok) return r;
            return MQ.math.full.parse(v).filter(n => n.isConstantNode).length === 1 ? ok : { ok: false, why: 'That is equal, but it still has more than one number. Multiply the numbers together.' };
          } },
        { title: 'Double the length', kind: 'expr', vars: ['a', 'b', 'c'], question: '(2a*b*c)/(a*b*c)', tex: '\\frac{(2a) \\cdot b \\cdot c}{a \\cdot b \\cdot c}',
          goal: 'Make the box twice as long: its length becomes <code>2a</code>. How many times bigger is the new volume? The question divides the new volume by the old one: cancel until no division is left.',
          how: [
            'The question is a <b>fraction</b>, the top divided by the bottom: the new volume, <code>(2a) · b · c</code>, over the old one, <code>a · b · c</code>. Its value says how many old boxes fit in the new one.',
            '<code>a</code>, <code>b</code> and <code>c</code> are on the top and on the bottom. Anything divided by itself is 1, like <code>6 ÷ 6</code>, so each pair <b>cancels</b>: you can cross it out.',
            'Cross out <code>a</code>, <code>b</code> and <code>c</code>, and only the <code>2</code> on top is left.',
            'So doubling one edge doubles the volume, whatever the box. Try it on the sliders: set <code>a</code> to 2, then 4, and watch <code>V</code>.',
          ],
          explain: 'The question itself has the same value as the answer, so it would pass a plain equality check. This mission also asks that no division is left, to show you cancelled.',
          hint: 'What is left on top once <code>a</code>, <code>b</code> and <code>c</code> are crossed out?',
          answer: '2', wrong: '2a', lazy: '(2a*b*c)/(a*b*c)',
          check: v => MQ.check.expr(v, '2', { vars: ['a', 'b', 'c'], form: 'noDivision' }) },
        { title: 'Make V = 64', kind: 'scene',
          goal: 'Set the length <code>a</code> to 4, then move the width and height until the volume <code>V</code> is 64.',
          how: [
            'You want <code>a · b · c = 64</code> with <code>a = 4</code>; the scene works out <code>V</code> each time you move a slider.',
            '<code>a = 4</code> fixes the length, so <code>b · c</code> has to make up the rest: 64 ÷ 4 is 16, so <code>b · c</code> must be 16.',
            '<code>b</code> and <code>c</code> each go from 1 to 6 on their sliders. Which two of those numbers multiply to 16?',
            'The live line under the box shows <code>V</code> as you go, and the mission passes the moment it reads 64.',
          ],
          explain: 'All three edges are 4, so every face is a square: a box like that is called a <b>cube</b>.',
          hint: 'Try <code>b</code> at 4. What does <code>c</code> need to be?',
          answer: { a: 4, b: 4, c: 4 }, wrong: { a: 4, b: 4, c: 2 }, lazy: { a: 4, b: 2, c: 2 },
          check: s => s.params.a !== 4 ? { ok: false, why: 'Keep the length a at 4.' }
            : s.derived.V === 64 ? ok : { ok: false, why: `V is ${s.derived.V} now. You need 64.` } },
        { title: 'Add like terms', kind: 'expr', vars: ['a'], question: '2a+3a',
          goal: 'Two boxes stand side by side. Both are 1 wide and 1 tall; one is <code>2a</code> long and the other <code>3a</code>. Together their volume is <code>2a + 3a</code>. Write it as one number times <code>a</code>.',
          how: [
            '<code>2a + 3a</code> is two lots of <code>a</code> plus three more lots of <code>a</code>, like 2 apples and 3 apples.',
            '<code>2a</code> means <code>2 · a</code> and <code>3a</code> means <code>3 · a</code>: both count lots of the same thing, <code>a</code>.',
            'Adding the counts, <code>2 + 3</code>, gives 5 lots of <code>a</code>, written <code>5a</code>.',
            'Careful: <code>2a + 3a</code> is not <code>6a</code>. You add the counts; you do not multiply them.',
          ],
          explain: 'Parts with the same letter, like <code>2a</code> and <code>3a</code>, are called <b>like terms</b>. You add them by adding the numbers in front.',
          hint: 'How many lots of <code>a</code> are there altogether?',
          answer: '5a', wrong: '6a', lazy: '2a+3a',
          check: v => MQ.check.expr(v, '5a', { vars: ['a'], form: 'product' }) },
      ],
    }],
    quickfire: [{
      ch: 0,
      make: r => {
        const n = () => 1 + Math.floor(r() * 9), p = n(), q = n(), s = n(), a = p * q + s;
        return { q: `${p}*${q}+${s}`, show: `p · q + r, with p = ${p}, q = ${q}, r = ${s}`, a, why: `${p} · ${q} = ${p * q} comes first, then + ${s} gives ${a}.` };
      },
    }],
    guide: [
      { ch: 0, title: 'What a variable is',
        what: 'A variable is a letter that stands for a number. In <code>V = a · b · c</code> the letters are the length, width and height of a box: change one and <code>V</code> changes with it. A number right before a letter means times, so <code>10c</code> is <code>10 · c</code>.' },
      { ch: 0, title: 'The volume of a box',
        what: 'The volume of a box is its length times its width times its height.',
        tex: 'V = a \\cdot b \\cdot c', scene: true,
        proof: 'Lay a row of <code>a</code> small cubes along the length. <code>b</code> rows side by side make one layer of <code>a · b</code> cubes, and <code>c</code> layers stacked up make <code>a · b · c</code>.' },
    ],
  };
})();
