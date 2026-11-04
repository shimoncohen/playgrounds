// Geometry track content (DOM-free). Chapter ids and order must match MQ.graph.chapters.geometry.
(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};
  const ok = { ok: true };
  const finalNumber = MQ.check.final.number;
  // final.number wants a bare number, so one trailing degree sign is dropped first.
  const angle = n => v => finalNumber(n)(String(v).replace(/\s*°\s*$/, ''));
  const num = v => String(+v.toFixed(2));
  const side = (term, a, b) => ({ type: 'polygon', term, pts: [a, b] });

  const shapes = {
    id: 'rect-tri', title: 'A rectangle and a triangle on a grid of 1 by 1 squares',
    params: {
      b: { min: 1, max: 8, step: 1, value: 4, label: 'base b' },
      h: { min: 1, max: 6, step: 1, value: 3, label: 'height h' },
      p: { min: 0, max: 8, step: 1, value: 1, label: 'top corner of the triangle' },
    },
    terms: ['tri'],
    derived: ({ b, h }) => ({ 'rectangle area': b * h, 'rectangle perimeter': 2 * (b + h), 'triangle area': b * h / 2 }),
    formula: '\\text{rectangle: } A = \\term{b}{b}\\times\\term{h}{h}\\qquad\\text{triangle: } \\term{tri}{A} = \\tfrac{1}{2}\\times\\term{b}{b}\\times\\term{h}{h}',
    live: ({ params: { b, h } }) => `Rectangle: A = ${b} × ${h} = ${b * h}, perimeter = ${2 * (b + h)}.   Triangle: A = ½ × ${b} × ${h} = ${num(b * h / 2)}.`,
    draw: {
      kind: '2d', view: [-2, 9, -1, 7], box: [440, 320],
      items: ({ params: { b, h, p } }) => [
        { type: 'grid' },
        { type: 'polygon', term: 'tri', pts: [[0, 0], [b, 0], [p, h]] },
        side('h', [p, 0], [p, h]),
        side('b', [0, 0], [b, 0]), side('b', [0, h], [b, h]),
        side('h', [0, 0], [0, h]), side('h', [b, 0], [b, h]),
        { type: 'text', x: b / 2, y: -0.5, s: `b = ${b}`, term: 'b' },
        { type: 'text', x: -0.2, y: h / 2, s: `h = ${h}`, term: 'h', anchor: 'end' },
        { type: 'point', x: p, y: h, term: 'p', drag: { x: 'p' }, label: 'top corner of the triangle' },
        { type: 'point', x: b, y: h, drag: { x: 'b', y: 'h' }, label: 'top right corner of the rectangle' },
      ],
    },
  };

  const R = 4.9, rad = d => d * Math.PI / 180, at = (d, r) => [r * Math.cos(rad(d)), r * Math.sin(rad(d))];
  const wedge = (from, to, term) => ({ type: 'polygon', term, pts: [[0, 0], ...Array.from({ length: 13 }, (_, i) => at(from + (to - from) * i / 12, 1.3))] });
  const split = ({ r1, r2 }) => { const lo = Math.min(r1, r2), hi = Math.max(r1, r2); return { lo, hi, a: lo, b: hi - lo, c: 180 - hi }; };
  const rays = {
    id: 'line-rays', title: 'Two rays split a straight line into three angles',
    params: {
      r1: { min: 10, max: 170, step: 10, value: 40, label: 'first ray' },
      r2: { min: 10, max: 170, step: 10, value: 110, label: 'second ray' },
    },
    terms: ['a', 'b', 'c'],
    derived: p => { const { a, b, c } = split(p); return { a, b, c, 'a + b + c': a + b + c }; },
    formula: '\\term{a}{a} + \\term{b}{b} + \\term{c}{c} = 180^\\circ',
    live: ({ derived: d }) => `${d.a}° + ${d.b}° + ${d.c}° = ${d['a + b + c']}°`,
    draw: {
      kind: '2d', view: [-5.5, 5.5, -1, 5.5], box: [440, 260],
      items: ({ params }) => {
        const { lo, hi, a, b, c } = split(params);
        const label = (d, s, term) => { const [x, y] = at(d, 2.1); return { type: 'text', x, y, s, term }; };
        return [
          { type: 'polygon', pts: [[-5.2, 0], [5.2, 0]] },
          wedge(0, lo, 'a'), wedge(lo, hi, 'b'), wedge(hi, 180, 'c'),
          label(lo / 2, `${a}°`, 'a'), label((lo + hi) / 2, `${b}°`, 'b'), label((hi + 180) / 2, `${c}°`, 'c'),
          ...['r1', 'r2'].map(r => ({ type: 'vector', term: r, from: [0, 0], to: at(params[r], R) })),
          { type: 'point', x: 0, y: 0 },
          ...['r1', 'r2'].map((r, i) => { const [x, y] = at(params[r], R - 0.6); return { type: 'point', x, y, term: r, drag: { angle: r, step: 10 }, label: i ? 'second ray' : 'first ray' }; }),
        ];
      },
    },
  };

  const lShape = '<svg viewBox="-30 -14 200 150" width="200" role="img" aria-label="An L shape: 10 along the bottom, 8 up the left side, with a 4 by 3 corner cut off at the top right" style="display:block;margin:8px 0;max-width:100%">'
    + '<polygon points="0,112 140,112 140,42 84,42 84,0 0,0" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="2"/>'
    + '<g fill="currentColor" font-size="13" text-anchor="middle"><text x="70" y="130">10</text><text x="-12" y="60">8</text><text x="112" y="36">4</text><text x="96" y="24">3</text></g></svg>';

  MQ.content = {
    track: 'geometry',
    ranks: [[0, 'Dot Joiner'], [40, 'Shape Builder'], [100, 'Angle Ace']],
    chapters: [{
      id: 'geometry.area', name: 'Area and perimeter', badge: 'Area Builder',
      intro: 'The <b>area</b> of a flat shape is how much space it covers, counted in 1 by 1 squares, like floor tiles. Its <b>perimeter</b> is the distance all the way round its edge, like a fence. In the scene every grid square is 1 by 1. The bottom side of the rectangle is its <b>base</b> <code>b</code>, and its <b>height</b> <code>h</code> goes straight up. Drag a corner, or move a slider, and the shapes, the formulas and the numbers change together.',
      scene: shapes,
      missions: [
        { title: 'Cover the floor', kind: 'number', question: '12*7', tex: 'A = b \\times h \\;\\text{ with }\\; b = 12,\\ h = 7',
          goal: 'A floor is a rectangle 12 long and 7 wide. How many 1 by 1 tiles cover it? Work out its area <code>A = b × h</code>.',
          how: [
            '<code>A = b × h</code> counts the squares in a rectangle: <code>h</code> rows, each with <code>b</code> squares in it.',
            '<code>b</code> is the base, 12, and <code>h</code> is the height, 7. Putting them in gives your first step, <code>12 × 7</code> (type <code>12*7</code>).',
            '<code>12 × 7</code> is 84, so 84 tiles cover the floor.',
            'Adding the sides all the way round, <code>12 + 7 + 12 + 7</code>, gives 38. That is the perimeter, the length of the edge, which measures something else.',
          ],
          explain: 'The rectangle in the scene goes up to 8 by 6, so it cannot show this floor. Try a smaller one: drag its top right corner to 4 by 3 and count the 12 squares inside.',
          hint: 'How many rows of tiles are there, and how many tiles are in each row?',
          answer: '84', wrong: '38', lazy: '12*7', check: finalNumber(84) },
        { title: 'Half a rectangle', kind: 'number', question: '1/2*10*9', tex: 'A = \\tfrac{1}{2} \\times b \\times h \\;\\text{ with }\\; b = 10,\\ h = 9',
          goal: 'A triangle has a base of 10 and a height of 9. Work out its area <code>A = ½ × b × h</code>, where <code>½</code> means one half.',
          how: [
            '<code>A = ½ × b × h</code> says: a triangle covers half of the rectangle drawn around it.',
            '<code>b × h</code> is that rectangle: <code>10 × 9</code> is 90 squares.',
            '<code>½ ×</code> takes half of it. <code>½</code> means one half, so multiplying by <code>½</code> is the same as dividing by 2. Type it as <code>1/2</code>, so the whole line is <code>1/2*10*9</code>.',
            'Half of 90 is 45, the area of the triangle. Forgetting the <code>½</code> gives 90, the whole rectangle.',
          ],
          explain: 'The height of a triangle goes straight up from the base to the top corner, not along a sloping side. In the scene, slide the top corner of the triangle along: the base and height stay the same, and so does the area.',
          hint: 'First find the rectangle, <code>10 × 9</code>. The triangle is half of it.',
          answer: '45', wrong: '90', lazy: '1/2*10*9', check: finalNumber(45) },
        { title: 'An L-shaped room', kind: 'number', question: '10*8-4*3', tex: '\\text{a } 10 \\times 8 \\text{ rectangle with a } 4 \\times 3 \\text{ corner cut off}',
          goal: 'A room is shaped like an L: a rectangle 10 wide and 8 tall with a 4 by 3 corner cut off at the top right. Work out its area.' + lShape,
          how: [
            'The L is not a rectangle, but it is made of rectangles: find their areas, then add or take away.',
            'One way: the whole 10 by 8 rectangle is <code>10 × 8 = 80</code> squares, before the corner is cut off.',
            'The missing corner is <code>4 × 3 = 12</code> squares, so take it away: your step is <code>80 − 12</code> (type <code>80-12</code>), which is 68.',
            'Another way gives the same answer: cut the L into a bottom part 10 by 5 and a top part 6 by 3. <code>50 + 18</code> is 68 too.',
          ],
          explain: 'Any shape with only square corners can be cut into rectangles like this. Whichever way you cut it, the area comes out the same.',
          hint: 'Find the area of the full 10 by 8 rectangle. How much of it is missing?',
          answer: '68', wrong: '80', lazy: '10*8-4*3', check: finalNumber(68) },
        { title: 'The missing side', kind: 'number', question: '54/9', tex: 'b \\times h = 54 \\;\\text{ with }\\; b = 9,\\ h = ?',
          goal: 'A rectangle has an area of 54 and a base of 9. How tall is it? Find the height <code>h</code>.',
          how: [
            'You know the answer to <code>b × h</code> and one of the numbers, so you work the multiplication backwards.',
            '<code>9 × h = 54</code> asks: 9 times what makes 54?',
            'Dividing undoes multiplying: <code>54 ÷ 9</code> (type <code>54/9</code>) is 6.',
            'Check it: <code>9 × 6</code> is 54, so the height is 6. Taking away, <code>54 − 9</code>, gives 45, which does not fit.',
          ],
          explain: 'This is how a builder finds a missing length: if you know the area and one side, divide the area by that side.',
          hint: 'Which number times 9 gives 54?',
          answer: '6', wrong: '45', lazy: '54/9', check: finalNumber(6) },
        { title: 'Area 24, perimeter 20', kind: 'scene',
          goal: 'Drag the top right corner of the rectangle until its area is 24 squares and its perimeter is 20.',
          how: [
            'You want a rectangle where <code>b × h = 24</code> and <code>b + h + b + h = 20</code>; the scene works out both as you drag.',
            'The perimeter goes round each side once, so it is <code>b + h</code> twice: <code>b + h</code> must be 10.',
            'Which two numbers multiply to 24 and add up to 10? Try a few: 8 and 3 multiply to 24 but add up to 11.',
            'The live line under the grid shows the area and the perimeter, and the mission passes once they read 24 and 20.',
          ],
          explain: '8 by 3 and 6 by 4 both cover 24 squares, but their edges have different lengths, 22 and 20. The same area can have different perimeters.',
          hint: 'Try a height of 4. What base gives an area of 24?',
          answer: { b: 6, h: 4 }, wrong: { b: 8, h: 3 }, lazy: {},
          check: s => {
            const A = s.derived['rectangle area'], P = s.derived['rectangle perimeter'];
            return A !== 24 ? { ok: false, why: `The area is ${A} now. You need 24.` }
              : P !== 20 ? { ok: false, why: `The area is 24, but the perimeter is ${P}. You need 20.` } : ok;
          } },
      ],
    }, {
      id: 'geometry.angles', name: 'Angles', badge: 'Angle Ace',
      intro: 'An <b>angle</b> is the amount of turn between two lines that meet at a point. It is measured in <b>degrees</b>, written with a small circle: <code>90°</code> is a quarter turn, a <b>right angle</b>, like the corner of a page. A full turn is <code>360°</code>, so half a turn, a straight line, is <code>180°</code>. You can type an answer with or without the <code>°</code>. In the scene, two <b>rays</b>, lines that start at a point and go on in one direction, split a straight line into three angles. Drag a ray and watch the angles and their sum.',
      scene: rays,
      missions: [
        { title: 'On a straight line', kind: 'number', question: '180-47', tex: '47^\\circ + x = 180^\\circ',
          goal: 'A ray splits a straight line into two angles. One is <code>47°</code>. How big is the other one, <code>x</code>?',
          how: [
            'The two angles together make the straight line, half a turn, so they add up to <code>180°</code>.',
            '<code>47°</code> is the part you know. <code>x</code> is whatever is left of the 180.',
            'Take the part you know away from the whole: <code>180 − 47</code> (type <code>180-47</code>) is 133.',
            'Check it: <code>47 + 133</code> is 180. Taking 47 from 90 instead gives 43, which belongs to a right angle, not a straight line.',
          ],
          explain: 'In the scene, put the two rays on top of each other: the middle angle shrinks to <code>0°</code>, and the other two still add up to <code>180°</code>.',
          hint: 'A straight line is <code>180°</code>. How much is left after <code>47°</code>?',
          answer: '133', wrong: '43', lazy: '180-47', check: angle(133) },
        { title: 'All the way round', kind: 'number', question: '360-110-95-80', tex: '110^\\circ + 95^\\circ + 80^\\circ + x = 360^\\circ',
          goal: 'Four angles fit round a point: <code>110°</code>, <code>95°</code>, <code>80°</code> and <code>x</code>. Find <code>x</code>.',
          how: [
            'The four angles go all the way round the point, one full turn, so together they make <code>360°</code>.',
            'The three you know add up to <code>110 + 95 + 80</code>, which is 285.',
            '<code>x</code> is the rest of the full turn: <code>360 − 285</code> (type <code>360-285</code>) is 75.',
            'Check it: <code>285 + 75</code> is 360. The 285 alone is not the answer: it is the part already used.',
          ],
          explain: 'A full turn is two straight lines, back to back: <code>180° + 180° = 360°</code>.',
          hint: 'Add up the three angles you know. How much of the <code>360°</code> is left?',
          answer: '75', wrong: '285', lazy: '360-110-95-80', check: angle(75) },
        { title: 'Inside a triangle', kind: 'number', question: '180-58-71', tex: '58^\\circ + 71^\\circ + x = 180^\\circ',
          goal: 'A triangle has two angles of <code>58°</code> and <code>71°</code>. The three angles inside a triangle always add up to <code>180°</code>. Find the third angle, <code>x</code>.',
          how: [
            'All three angles of the triangle together make <code>180°</code>, the same as a straight line.',
            'The two you know add up to <code>58 + 71</code>, which is 129.',
            '<code>x</code> is what is left: <code>180 − 129</code> (type <code>180-129</code>) is 51.',
            'Check it: <code>58 + 71 + 51</code> is 180. Using 360 by mistake gives 231, bigger than a straight line, which cannot fit inside a triangle.',
          ],
          explain: 'The three angles in the scene make a straight line. A triangle\'s three corners do the same: put them side by side and they fill a straight line, as the field guide shows.',
          hint: 'Add the two angles you know, then take that away from <code>180°</code>.',
          answer: '51', wrong: '231', lazy: '180-58-71', check: angle(51) },
        { title: 'Opposite angles', kind: 'number', question: '76/2', tex: '\\text{two opposite angles: } x + x = 76^\\circ',
          goal: 'Two straight lines cross like an open pair of scissors, making four angles. The angle between the blades and the one opposite it, between the handles, add up to <code>76°</code>. How big is one of them, <code>x</code>?',
          how: [
            'Where two straight lines cross, the two angles opposite each other are always the same size. They are called <b>vertically opposite</b> angles.',
            'Why: each of them sits on a straight line next to the same neighbour, so each is <code>180°</code> take away that neighbour.',
            'So <code>76°</code> is two equal angles together: <code>76 ÷ 2</code> (type <code>76/2</code>) is 38.',
            'Check it: the neighbour is <code>180 − 38 = 142</code>, and <code>38 + 142</code> is 180, a straight line. 104, which is 180 − 76, mixes the two angles up.',
          ],
          explain: 'Open and close a pair of scissors: the angle between the blades and the angle between the handles grow and shrink together.',
          hint: 'The two opposite angles are equal. What is half of <code>76°</code>?',
          answer: '38', wrong: '104', lazy: '76/2', check: angle(38) },
        { title: 'Three equal slices', kind: 'scene',
          goal: 'Drag the two rays until the three angles on the straight line are all the same size.',
          how: [
            'The three angles always add up to <code>180°</code>, because together they make the straight line.',
            'Three equal angles share the 180 fairly: each one is <code>180 ÷ 3</code>.',
            'Drag a ray tip, or focus it and press the arrow keys, to turn it 10° at a time. The sliders below the picture move the rays too.',
            'The live line under the picture shows the three angles and their sum. The mission passes when all three match.',
          ],
          explain: 'Each angle is <code>60°</code>. A triangle with three <code>60°</code> corners has three equal sides too: it is called an <b>equilateral</b> triangle.',
          hint: 'Each angle is <code>180 ÷ 3</code>. Put the first ray there.',
          answer: { r1: 60, r2: 120 }, wrong: { r1: 60, r2: 100 }, lazy: {},
          check: ({ derived: { a, b, c } }) => a === b && b === c ? ok : { ok: false, why: `The angles are ${a}°, ${b}° and ${c}° now. Make all three the same.` } },
      ],
    }],
    quickfire: [{
      ch: 0,
      make: r => {
        const n = () => 2 + Math.floor(r() * 11);
        for (;;) {
          const b = n(), h = n(), kind = Math.floor(r() * 3);
          if (kind === 0) return { q: `${b}*${h}`, show: `Rectangle ${b} by ${h}: area?`, a: b * h, why: `${b} × ${h} = ${b * h} squares.` };
          if (kind === 1) return { q: `2*(${b}+${h})`, show: `Rectangle ${b} by ${h}: perimeter?`, a: 2 * (b + h), why: `${b} + ${h} + ${b} + ${h} = ${2 * (b + h)}.` };
          // whole-number triangle areas only: a half answer needs a decimal point the quick-fire field may not suggest
          if ((b * h) % 2 === 0) return { q: `1/2*${b}*${h}`, show: `Triangle, base ${b}, height ${h}: area?`, a: b * h / 2, why: `${b} × ${h} = ${b * h}, and half of that is ${b * h / 2}.` };
        }
      },
    }, {
      ch: 1,
      make: r => {
        const n = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)), kind = Math.floor(r() * 3);
        if (kind === 0) { const a = n(11, 169); return { q: `180-${a}`, show: `A straight line is split into ${a}° and x. x = ?`, a: 180 - a, why: `180 − ${a} = ${180 - a}.` }; }
        if (kind === 1) { const a = n(20, 100), b = n(20, 150 - a); return { q: `180-${a}-${b}`, show: `A triangle has angles ${a}°, ${b}° and x. x = ?`, a: 180 - a - b, why: `${a} + ${b} = ${a + b}, and 180 − ${a + b} = ${180 - a - b}.` }; }
        const a = n(60, 150), b = n(40, 280 - a); return { q: `360-${a}-${b}`, show: `Round a point: ${a}°, ${b}° and x. x = ?`, a: 360 - a - b, why: `${a} + ${b} = ${a + b}, and 360 − ${a + b} = ${360 - a - b}.` };
      },
    }],
    guide: [
      { ch: 0, title: 'Area and perimeter',
        what: 'Area counts the 1 by 1 squares a shape covers. Perimeter adds up the lengths all the way round its edge. For a rectangle with base <code>b</code> and height <code>h</code>:',
        tex: 'A = b \\times h \\qquad P = b + h + b + h', scene: true },
      { ch: 0, title: 'A triangle is half a rectangle',
        what: 'A triangle covers half of the rectangle around it, so its area is half of base times height.',
        tex: 'A = \\tfrac{1}{2} \\times b \\times h',
        proof: 'Draw a line from the top corner straight down to the base. It cuts the rectangle into two smaller rectangles, and each side of the triangle cuts one of them in half, corner to corner. The triangle keeps one half of each, so half of <code>b × h</code> in all.' },
      { ch: 1, title: 'Angles on a line and round a point',
        what: 'Angles that make up a straight line add up to <code>180°</code>. Angles all the way round a point add up to <code>360°</code>, a full turn.',
        tex: 'a + b + c = 180^\\circ', scene: true },
      { ch: 1, title: 'The angles in a triangle',
        what: 'The three angles inside any triangle add up to <code>180°</code>. Where two straight lines cross, the angles opposite each other are equal.',
        tex: 'a + b + c = 180^\\circ',
        proof: 'Cut a triangle out of paper and tear off its three corners. Put their points together side by side: they always fill a straight line exactly, <code>180°</code>.' },
    ],
  };
})();
