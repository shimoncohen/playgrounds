// Arithmetic track content (DOM-free). Chapter ids and order must match MQ.graph.chapters.arithmetic.
(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};
  const ok = { ok: true };
  const oneNumber = /^\s*-?\d+(\.\d+)?\s*$/;
  // The step checker accepts any line with the right value, so the final answer must also be a single number.
  const finalNumber = value => v => !oneNumber.test(v) ? { ok: false, why: 'Keep going until your last line is one number.' } : MQ.check.number(v, value);

  const N = (label, value) => ({ min: 1, max: 5, step: 1, value, label });
  const width = s => String(s).length * 0.35 + 0.55;
  const chips = (toks, y) => {
    const gap = 0.2, total = toks.reduce((w, t) => w + (t[2] === false ? 0.4 : width(t[0])) + gap, -gap);
    let x = 5 - total / 2;
    const out = [];
    for (const [s, term, box] of toks) {
      const w = box === false ? 0.4 : width(s), cx = x + w / 2;
      if (box !== false) out.push({ type: 'polygon', term, pts: [[x, y - 0.45], [x + w, y - 0.45], [x + w, y + 0.45], [x, y + 0.45]] });
      out.push({ type: 'text', x: cx, y, s: String(s), term });
      x += w + gap;
    }
    return out;
  };
  const rows = ({ a, b, c }, t) => {
    const k = Math.min(2, Math.floor(t));
    return [
      [[[a, 'a'], ['+', 'add'], [b, 'b'], ['×', 'mul'], [c, 'c']], [[a, 'a'], ['+', 'add'], [b * c, 'mul']], [[a + b * c, 'add']]][k],
      [[['(', null, false], [a, 'a'], ['+', 'add'], [b, 'b'], [')', null, false], ['×', 'mul'], [c, 'c']], [[a + b, 'add'], ['×', 'mul'], [c, 'c']], [[(a + b) * c, 'mul']]][k],
    ];
  };
  const line = toks => toks.map(t => t[0]).join(' ').replace('( ', '(').replace(' )', ')');

  const order = {
    id: 'order-machine', title: 'Two rows: without brackets and with brackets',
    params: { a: N('a', 2), b: N('b', 3), c: N('c', 4) },
    terms: ['add', 'mul'],
    t: { min: 0, max: 3, step: 0.01, value: 0, speed: 0.8, label: 'step' },
    derived: p => ({ 'a + b × c': p.a + p.b * p.c, '(a + b) × c': (p.a + p.b) * p.c }),
    formula: '\\term{a}{a}\\term{add}{+}\\term{b}{b}\\term{mul}{\\times}\\term{c}{c}\\qquad(\\term{a}{a}\\term{add}{+}\\term{b}{b})\\term{mul}{\\times}\\term{c}{c}',
    live: s => { const [r1, r2] = rows(s.params, s.t); return `Step ${Math.min(2, Math.floor(s.t))}:  ${line(r1)}   and   ${line(r2)}`; },
    draw: {
      kind: '2d', view: [0, 10, 0, 4.5], box: [400, 180],
      items: s => {
        const [r1, r2] = rows(s.params, s.t);
        return [
          { type: 'text', x: 0.2, y: 4.15, s: 'No brackets', small: true, anchor: 'start' }, ...chips(r1, 3.25),
          { type: 'text', x: 0.2, y: 1.9, s: 'With brackets', small: true, anchor: 'start' }, ...chips(r2, 1),
        ];
      },
    },
  };

  MQ.content = {
    track: 'arithmetic',
    ranks: [[0, 'Counter'], [30, 'Bracket Breaker'], [75, 'Order Keeper']],
    chapters: [{
      id: 'arithmetic.order', name: 'Order of operations', badge: 'Order Keeper',
      intro: '+, −, × and ÷ are called <b>operations</b>. A line with several of them can be read in more than one way: <code>6 + 4 × 3</code> is 30 if you add first and 18 if you multiply first. The <b>order of operations</b> is the rule everyone agrees on, so every line has one answer. Under each question you write your <b>working</b>: one step per line, each a shorter version of the line above. Your last line is your answer.',
      scene: order,
      missions: [
        { title: 'Brackets first', kind: 'number', question: '(6+4)*3', tex: '(6 + 4) \\times 3',
          goal: 'Work out <code>(6 + 4) × 3</code>. Write one step per line under the question, and finish with one number.',
          how: [
            'The whole line adds 6 and 4, then multiplies that total by 3: brackets mean "work me out first".',
            '<code>(6 + 4)</code> comes first: it is 10. So your first step is <code>10 × 3</code> (type <code>10*3</code>).',
            '<code>× 3</code> then works on that 10: <code>10 × 3</code> is 30.',
            'Your last line, <code>30</code>, is the answer. Without the brackets, <code>6 + 4 × 3</code> is 18: the brackets changed the answer.',
          ],
          explain: 'On a keyboard, × is <code>*</code> and ÷ is <code>/</code>. The preview may show × as a raised dot, <code>·</code>: it means the same thing. Press <kbd>Enter</kbd> for a new line.',
          hint: 'Work out the bracket first: what is <code>6 + 4</code>? Then multiply that by 3.',
          answer: '30', wrong: '18', lazy: '(6+4)*3', check: finalNumber(30) },
        { title: 'Times and divide: left to right', kind: 'number', question: '12/2*3', tex: '12 \\div 2 \\times 3',
          goal: 'Work out <code>12 ÷ 2 × 3</code>. There are no brackets, so go from left to right.',
          how: [
            'The whole line halves 12, then triples what is left: × and ÷ are worked out in the order you read them, left to right.',
            '<code>12 ÷ 2</code> is first from the left: it is 6. Your next line is <code>6 × 3</code>.',
            '<code>× 3</code> then works on that 6, so the answer is 18.',
            'A common slip is <code>2 × 3</code> first: <code>12 ÷ 6</code> gives 2, which answers a different question.',
          ],
          explain: '× and ÷ have the same rank, so neither one goes first by rule: you take them from left to right, like reading a sentence.',
          hint: 'Start from the left. What is <code>12 ÷ 2</code>?',
          answer: '18', wrong: '2', lazy: '12/2*3', check: finalNumber(18) },
        { title: 'Plus and minus come last', kind: 'number', question: '10-4+2*3', tex: '10 - 4 + 2 \\times 3',
          goal: 'Work out <code>10 − 4 + 2 × 3</code>.',
          how: [
            'The whole line takes 4 from 10 and adds two threes: × and ÷ go before + and −, and then + and − go left to right.',
            '<code>2 × 3</code> goes first, even though it is at the end: it is 6. Next line: <code>10 − 4 + 6</code>.',
            '<code>10 − 4</code> is the first + or − from the left: it is 6. Next line: <code>6 + 6</code>.',
            '<code>6 + 6</code> is 12, your answer. Doing <code>4 + 6</code> before the minus would give 0, which is the wrong way round.',
          ],
          explain: 'That is the whole order: brackets, then × and ÷ left to right, then + and − left to right.',
          hint: 'Find the × and work it out first. Then go left to right through the − and the +.',
          answer: '12', wrong: '0', lazy: '10-4+2*3', check: finalNumber(12) },
        { title: 'The full chain', kind: 'number', question: '1*2-3*2+10/(2-1)', tex: '1 \\times 2 - 3 \\times 2 + 10 \\div (2 - 1)', work: 'required',
          goal: 'Work out <code>1 × 2 − 3 × 2 + 10 ÷ (2 − 1)</code>. This one checks your working: write at least one step before the answer, and every line has to be right, so a slip keeps the mission open until you fix that line or delete it.',
          how: [
            'This line uses every rule at once: brackets, then × and ÷, then + and −, each left to right.',
            '<code>(2 − 1)</code> first: it is 1, so the line becomes <code>1 × 2 − 3 × 2 + 10 ÷ 1</code>.',
            'Then each × and ÷ from the left: <code>1 × 2</code> is 2, <code>3 × 2</code> is 6 and <code>10 ÷ 1</code> is 10. Now it reads <code>2 − 6 + 10</code>.',
            'Last the − and +, left to right. <code>2 − 6</code> goes 4 below zero, which is written <code>−4</code> (type <code>-4</code>); then <code>−4 + 10</code> is 6.',
          ],
          explain: 'Each line of your working is checked against the question, not against the line above it, so one slip only marks that one line.',
          hint: 'Rewrite the line with the bracket worked out. Then rewrite it with every × and ÷ worked out. Each rewrite is one step.',
          steps: ['1*2-3*2+10/1', '2-6+10', '6'],
          answer: '6', wrong: '0', lazy: '1*2-3*2+10/(2-1)', check: finalNumber(6) },
        { title: 'When brackets change nothing', kind: 'scene',
          goal: 'Move the sliders until <code>a + b × c</code> and <code>(a + b) × c</code> give the same answer.',
          how: [
            'The scene works out the same three numbers two ways, once without brackets and once with them. The letters <code>a</code>, <code>b</code> and <code>c</code> stand for the numbers on the sliders.',
            '<code>a + b × c</code> multiplies only <code>b</code> by <code>c</code>, then adds <code>a</code>.',
            '<code>(a + b) × c</code> adds first, so <code>a</code> gets multiplied by <code>c</code> too.',
            'Press Play, or drag the step slider, to watch each row shrink one step at a time. Then change one slider at a time and compare the last chip of each row.',
          ],
          explain: 'With <code>c</code> at 1, multiplying by <code>c</code> changes nothing, so it does not matter whether <code>a</code> is inside the brackets. For every other <code>c</code> the brackets change the answer.',
          hint: 'Which slider can make <code>× c</code> do nothing at all?',
          answer: { a: 2, b: 3, c: 1 }, wrong: { a: 1, b: 2, c: 2 }, lazy: {},
          check: s => {
            const x = s.derived['a + b × c'], y = s.derived['(a + b) × c'];
            return x === y ? ok : { ok: false, why: `Not the same yet: ${x} and ${y}.` };
          } },
      ],
    }],
    quickfire: [{
      ch: 0,
      make: r => {
        const n = () => 1 + Math.floor(r() * 9), op = () => ['+', '-', '*'][Math.floor(r() * 3)];
        const f = (x, o, y) => (o === '+' ? x + y : o === '-' ? x - y : x * y);
        const sym = o => ({ '+': '+', '-': '−', '*': '×' }[o]);
        for (;;) {
          const a = n(), b = n(), c = n(), o1 = op(), o2 = op();
          const show = `${a} ${sym(o1)} ${b} ${sym(o2)} ${c}`, q = `${a}${o1}${b}${o2}${c}`;
          // Negative numbers are only met in passing in this chapter, so quick-fire keeps every step at zero or above.
          if (o2 === '*' && o1 !== '*') {
            const bc = b * c, ans = f(a, o1, bc);
            if (ans >= 0) return { q, show, a: ans, why: `${b} × ${c} = ${bc} comes first, then ${a} ${sym(o1)} ${bc} = ${ans}.` };
          } else {
            const ab = f(a, o1, b), ans = f(ab, o2, c);
            if (ab >= 0 && ans >= 0) return { q, show, a: ans, why: `${o1 === '*' ? '' : 'Left to right: '}${a} ${sym(o1)} ${b} = ${ab}${o1 === '*' ? ' comes first' : ''}, then ${ab} ${sym(o2)} ${c} = ${ans}.` };
          }
        }
      },
    }],
    guide: [
      { ch: 0, title: 'The order of operations',
        what: 'Work out a line in this order: 1. brackets; 2. × and ÷, left to right; 3. + and −, left to right.',
        tex: '(6 + 4) \\times 3 = 30 \\qquad 6 + 4 \\times 3 = 18', scene: true },
      { ch: 0, title: 'Why 10 ÷ (2 − 1) is not 10 ÷ 2 − 1',
        what: 'The bracket makes <code>2 − 1</code> happen first, so 10 is divided by 1 and the answer is 10. Without the bracket, ÷ goes first: <code>10 ÷ 2</code> is 5, then <code>5 − 1</code> is 4.',
        tex: '10 \\div (2 - 1) = 10 \\qquad 10 \\div 2 - 1 = 4' },
    ],
  };
})();
