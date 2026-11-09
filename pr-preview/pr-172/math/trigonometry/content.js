// Trigonometry track content (DOM-free). Chapter ids and order must match MQ.graph.chapters.trigonometry.
(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};
  const ok = { ok: true };
  const finalNumber = MQ.check.final.number;
  const rounded = MQ.check.final.rounded;
  // final.number wants a bare number, so one trailing degree sign is dropped first.
  const angle = n => v => finalNumber(n)(String(v).replace(/\s*°\s*$/, ''));
  const rad = d => d * Math.PI / 180;
  const r1 = v => +v.toFixed(1), r2 = v => v.toFixed(2);
  const side = (term, a, b) => ({ type: 'polygon', term, pts: [a, b] });

  // `ask` is the side a mission asks for: it reads "?" in the picture and the live line. `byAdj` sets the triangle by its
  // adjacent side instead of the hypotenuse, for a mission that gives the distance along the ground.
  const tri = ({ hypMax = 10, ask, byAdj } = {}) => ({
    id: 'right-triangle', title: 'A right triangle with a draggable angle and a hypotenuse slider',
    params: {
      ang: { min: 5, max: byAdj ? 50 : 85, step: 5, value: 30, label: 'angle' },
      ...(byAdj ? { adj: { min: 4, max: 8, step: 1, value: 8, label: 'adjacent' } } : { hyp: { min: 4, max: hypMax, step: 1, value: 10, label: 'hypotenuse' } }),
    },
    terms: ['opp', 'adj'],
    derived: p => {
      const hyp = byAdj ? p.adj / Math.cos(rad(p.ang)) : p.hyp, d = {
        hyp: r1(hyp), opp: r1(hyp * Math.sin(rad(p.ang))), adj: byAdj ? p.adj : r1(hyp * Math.cos(rad(p.ang))),
        sin: r2(Math.sin(rad(p.ang))), cos: r2(Math.cos(rad(p.ang))), tan: r2(Math.tan(rad(p.ang))),
      };
      // Given the adjacent side, the hypotenuse would hand over the asked side too: hyp × sin θ.
      if (ask) { d[ask] = '?'; if (byAdj) d.hyp = '?'; }
      return d;
    },
    // One row each: on one line KaTeX would break between the three fractions at 390px.
    formula: '\\begin{aligned}\\sin\\term{ang}{\\theta} &= \\frac{\\term{opp}{\\text{opp}}}{\\term{hyp}{\\text{hyp}}}\\\\ \\cos\\term{ang}{\\theta} &= \\frac{\\term{adj}{\\text{adj}}}{\\term{hyp}{\\text{hyp}}}\\\\ \\tan\\term{ang}{\\theta} &= \\frac{\\term{opp}{\\text{opp}}}{\\term{adj}{\\text{adj}}}\\end{aligned}',
    live: ({ params: { ang }, derived: d }) => ask
      ? `Angle ${ang}°, ${byAdj ? `adjacent ${d.adj}` : `hypotenuse ${d.hyp}`}. The ${ask === 'opp' ? 'opposite' : 'adjacent'} side is yours to find.`
      : `sin ${ang}° = ${d.opp} / ${d.hyp} = ${d.sin}.   cos ${ang}° = ${d.adj} / ${d.hyp} = ${d.cos}.   tan ${ang}° = ${d.opp} / ${d.adj} = ${d.tan}.`,
    draw: {
      kind: '2d', view: [-4.5, 12.5, -2, 10.5].map(v => v * hypMax / 10), box: [440, 324],
      items: ({ params: p, derived: d }) => {
        const ang = p.ang, hyp = byAdj ? p.adj / Math.cos(rad(ang)) : p.hyp, x = hyp * Math.cos(rad(ang)), y = hyp * Math.sin(rad(ang));
        const mid = rad(ang / 2), perp = rad(ang + 90);
        const wedge = Array.from({ length: 13 }, (_, i) => [1.6 * Math.cos(rad(ang) * i / 12), 1.6 * Math.sin(rad(ang) * i / 12)]);
        const sq = Math.min(0.7, x / 3, y / 3);
        return [
          { type: 'polygon', term: 'ang', pts: [[0, 0], ...wedge] },
          { type: 'polygon', pts: [[x - sq, 0], [x - sq, sq], [x, sq]] },
          side('adj', [0, 0], [x, 0]), side('opp', [x, 0], [x, y]), side('hyp', [0, 0], [x, y]),
          { type: 'text', x: x / 2, y: -0.9, s: `adj = ${d.adj}`, term: 'adj' },
          // At a small angle the opposite side is short and sits at the right edge, so its label goes above the tip instead.
          ang < 40 ? { type: 'text', x, y: y + 0.9, s: `opp = ${d.opp}`, term: 'opp', anchor: 'end' }
            : { type: 'text', x: x + 0.4, y: y / 2, s: `opp = ${d.opp}`, term: 'opp', anchor: 'start' },
          { type: 'text', x: x / 2 + 0.7 * Math.cos(perp), y: y / 2 + 0.7 * Math.sin(perp), s: `hyp = ${d.hyp}`, term: 'hyp', anchor: 'end' },
          { type: 'text', x: 2.9 * Math.cos(mid), y: 2.9 * Math.sin(mid), s: `${ang}°`, term: 'ang' },
          { type: 'point', x, y, term: 'hyp', drag: { angle: 'ang', step: 5 }, label: 'angle' },
        ];
      },
    },
  });
  const triangle = tri();

  const sketch = '<svg viewBox="-6 -6 212 132" width="210" role="img" aria-label="A right triangle with a 90 degree corner at the bottom right, an angle at the bottom left, and the sides marked hypotenuse, opposite and adjacent" style="display:block;margin:8px 0;max-width:100%">'
    + '<polygon points="0,110 190,110 190,0" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="2"/>'
    + '<path d="M170 110 V90 H190" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M34 110 A34 34 0 0 0 28 92" fill="none" stroke="currentColor" stroke-width="1.5"/>'
    + '<g fill="currentColor" font-size="13" text-anchor="middle"><text x="95" y="124">adjacent</text><text x="143" y="48" text-anchor="end">hypotenuse</text><text x="196" y="58" text-anchor="start" transform="rotate(90 196 58)">opposite</text><text x="48" y="104">θ</text></g></svg>';

  MQ.content = {
    track: 'trigonometry',
    ranks: [[0, 'Sketcher'], [25, 'Sine Scout'], [50, 'Ratio Whiz'], [75, 'Navigator']],
    chapters: [{
      id: 'trigonometry.ratios', name: 'Sine, cosine and tangent', badge: 'Brass Spyglass',
      story: 'Ilse\'s spyglass is tied to the top of the watchtower, so you use the ramp, the ladder and a look from the ground, with an angle and one known side, to find how high it hangs and reach it.',
      intro: 'On Windwhistle Hill, kite-keeper Ilse tied her brass spyglass to the top of the old watchtower and left a sketch of ramps and ladders to reach it. A <b>right triangle</b> has one square corner of <code>90°</code>. Its longest side, across from that corner, is the <b>hypotenuse</b>. Pick one of the other two corners and call its angle <code>θ</code>, the Greek letter theta. The side across from θ, not touching it, is the <b>opposite</b>. The other side that touches θ is the <b>adjacent</b>, which means next to it. A <b>ratio</b> compares two lengths by dividing one by the other. For a fixed angle the ratios of a right triangle\'s sides never change, however big the triangle is, and the three useful ones have names: <b>sine</b> is <code>opp ÷ hyp</code>, <b>cosine</b> is <code>adj ÷ hyp</code> and <b>tangent</b> is <code>opp ÷ adj</code>, written <code>sin</code>, <code>cos</code> and <code>tan</code>. The memory aid <b>SOH CAH TOA</b> spells them: <b>S</b>ine = <b>O</b>pposite over <b>H</b>ypotenuse, <b>C</b>osine = <b>A</b>djacent over <b>H</b>ypotenuse, <b>T</b>angent = <b>O</b>pposite over <b>A</b>djacent. Type <code>sin(35)</code> for the sine of 35°: angles are always in degrees here. Some answers ask you to <b>round to 1 decimal place</b>: keep one digit after the point, and look at the next digit, where 5 or more rounds up, so 5.736 becomes 5.7. In the scene, drag the dot to turn the angle, or move the slider to change the hypotenuse, and watch the three ratios.' + sketch,
      scene: triangle,
      missions: [
        { title: 'Find the opposite side', kind: 'number', round: 1, question: '10*sin(35)', tex: '\\text{opp} = \\text{hyp} \\times \\sin\\theta \\;\\text{ with }\\; \\text{hyp} = 10,\\ \\theta = 35^\\circ',
          goal: 'Ilse\'s kite-launch ramp is 10 long (the hypotenuse) and rises at an angle of <code>35°</code>. How high does it climb? That is the opposite side. Work it out and round to 1 decimal place.',
          how: [
            '<code>sin θ = opp ÷ hyp</code> (SOH). Multiply both sides by <code>hyp</code> and you get <code>opp = hyp × sin θ</code>.',
            'Putting in <code>hyp = 10</code> and <code>θ = 35°</code> gives your first step, <code>10 × sin(35)</code> (type <code>10*sin(35)</code>).',
            '<code>sin(35)</code> is about 0.5736, so the step comes to 5.736 and rounds to 5.7 (1 decimal place): the ramp climbs 5.7.',
            'Using <code>cos</code> instead of <code>sin</code> gives 8.2, which is the adjacent side, the distance along the ground.',
          ],
          explain: 'The scene opens on this ramp, with the opposite side as ?. Once you solve it, the scene shows the side, and sin 35° is that side divided by 10.',
          hint: 'The side you know is the hypotenuse and the side you want is the opposite. Which of S, C, T joins opp and hyp?',
          scene: tri({ ask: 'opp' }), at: { ang: 35, hyp: 10 }, reveal: true,
          answer: '5.7', wrong: '8.2', lazy: '10*sin(35)', check: rounded('10*sin(35)', 1) },
        { title: 'Find the adjacent side', kind: 'number', round: 1, question: '12*cos(40)', tex: '\\text{adj} = \\text{hyp} \\times \\cos\\theta \\;\\text{ with }\\; \\text{hyp} = 12,\\ \\theta = 40^\\circ',
          goal: 'Kit holds a 12 long ladder that leans so that it makes an angle of <code>40°</code> with the ground. How far along the ground is its foot from the wall? That is the adjacent side. Round to 1 decimal place.',
          how: [
            'You know the hypotenuse, 12, and want the adjacent side. <code>cos θ = adj ÷ hyp</code> (CAH) joins those two.',
            'Multiply both sides by <code>hyp</code>: <code>adj = hyp × cos θ</code>. Your first step is <code>12 × cos(40)</code> (type <code>12*cos(40)</code>).',
            '<code>cos(40)</code> is about 0.7660, so the step comes to 9.192 and rounds to 9.2.',
            '<code>sin</code> instead of <code>cos</code> gives 7.7, which is the opposite side, how high the ladder reaches.',
          ],
          explain: 'In the scene, a small angle makes the adjacent side almost as long as the hypotenuse, and cos near 1. A big angle makes it short, and cos near 0.',
          hint: 'The sides in play are the hypotenuse and the adjacent. Which of S, C, T joins them?',
          scene: tri({ hypMax: 12, ask: 'adj' }), at: { ang: 40, hyp: 12 }, reveal: tri({ hypMax: 12 }),
          answer: '9.2', wrong: '7.7', lazy: '12*cos(40)', check: rounded('12*cos(40)', 1) },
        { title: 'Use the tangent', kind: 'number', round: 1, question: '8*tan(30)', tex: '\\text{opp} = \\text{adj} \\times \\tan\\theta \\;\\text{ with }\\; \\text{adj} = 8,\\ \\theta = 30^\\circ',
          goal: 'You stand 8 from the foot of Ilse\'s watchtower and look at the spyglass on its top at an angle of <code>30°</code> above the ground. The 8 is the adjacent side. How tall is the tower, the opposite side? Round to 1 decimal place.',
          how: [
            'This time the sides are the adjacent (8) and the opposite (the height). <code>tan θ = opp ÷ adj</code> (TOA) joins them, and there is no hypotenuse in it.',
            'Multiply both sides by <code>adj</code>: <code>opp = adj × tan θ</code>. Your first step is <code>8 × tan(30)</code> (type <code>8*tan(30)</code>).',
            '<code>tan(30)</code> is about 0.5774, so the step comes to 4.619 and rounds to 4.6.',
            'Dividing instead, <code>8 ÷ tan(30)</code>, gives 13.9. That cannot be right: at an angle under 45°, the tower is shorter than the 8 you stand away from it.',
          ],
          explain: 'tan 45° is exactly 1: at 45° the opposite and adjacent sides are the same length. Below 45° the opposite side is shorter, as here.',
          hint: 'Which of S, C, T uses opp and adj and leaves the hypotenuse out?',
          scene: tri({ byAdj: true, ask: 'opp' }), at: { ang: 30, adj: 8 }, reveal: tri({ byAdj: true }),
          answer: '4.6', wrong: '13.9', lazy: '8*tan(30)', check: rounded('8*tan(30)', 1) },
        { title: 'Find the angle', kind: 'number', question: 'asin(5/10)', tex: '\\sin\\theta = \\frac{5}{10} \\;\\text{, so }\\; \\theta = \\sin^{-1}\\!\\left(\\frac{5}{10}\\right)',
          goal: 'Gust leans a different, 10 long ladder against the wall, so its triangle with the wall has an opposite side of 5 and a hypotenuse of 10. How big is the angle <code>θ</code>, in degrees? The scene opens at 45°: you can also drag the angle until the opposite side reads 5.',
          how: [
            'Now you know the sides and want the angle. <code>sin θ = opp ÷ hyp = 5 ÷ 10</code>, which is 0.5.',
            'The <b>inverse sine</b> undoes the sine: it takes the ratio and gives back the angle. It is written <code>sin⁻¹</code> or <code>asin</code>. Your step is <code>asin(5/10)</code> (type <code>asin(5/10)</code>).',
            '<code>asin(0.5)</code> is 30, so θ is 30°. You can type it with or without the <code>°</code>.',
            'Check it: <code>sin(30)</code> is 0.5. Stopping at 0.5 is the ratio, not the angle.',
          ],
          explain: 'The inverse is a second step with its own name: sin takes an angle to a ratio, and asin takes a ratio back to an angle. Use acos and atan the same way for the other two ratios.',
          hint: 'Find <code>opp ÷ hyp</code>, then use the inverse sine on it.',
          at: { ang: 45, hyp: 10 },
          answer: '30', wrong: '0.5', lazy: 'asin(5/10)', check: angle(30) },
        { title: 'Equal sides', kind: 'scene',
          goal: 'Drag the dot until the opposite side and the adjacent side are the same length.',
          how: [
            'When opposite and adjacent are equal, their ratio is 1: <code>tan θ = opp ÷ adj = 1</code>.',
            'Look at the live line under the picture: it shows <code>tan</code> for the angle you have now.',
            'Drag the dot, or focus it and press the arrow keys to turn the angle 5° at a time. The sliders below the picture move it too.',
            'The mission passes when the opposite and adjacent sides match. Does it matter how long the hypotenuse is?',
          ],
          explain: 'Equal opposite and adjacent sides make the tangent 1. The hypotenuse slider changes the size of the triangle but not its shape, so the angle stays the same.',
          hint: 'Half of a right angle is 45°. Put the dot there.',
          answer: { ang: 45, hyp: 10 }, wrong: { ang: 30, hyp: 10 }, lazy: {},
          check: ({ params: { ang }, derived: { opp, adj } }) => ang === 45 ? ok : { ok: false, why: `The opposite side is ${opp} and the adjacent side is ${adj} now. Make them the same.` } },
      ],
    }],
    quickfire: [{
      ch: 0,
      make: r => {
        const kind = Math.floor(r() * 3);
        const pick = list => list[Math.floor(r() * list.length)];
        if (kind === 0) {
          const [f, d, a, s] = pick([['sin', 30, 0.5, '1/2'], ['cos', 60, 0.5, '1/2'], ['tan', 45, 1, '1'], ['sin', 90, 1, '1'], ['cos', 0, 1, '1']]);
          return { q: `${f}(${d})`, show: `${f} ${d}° = ?`, a, why: `${f} ${d}° is exactly ${s}.` };
        }
        if (kind === 1) {
          const h = 2 * (2 + Math.floor(r() * 10));
          return { q: `${h}*sin(30)`, show: `Hypotenuse ${h}, angle 30°: the opposite side?`, a: h / 2, why: `sin 30° = 1/2, so opp = ${h} × 1/2 = ${h / 2}.` };
        }
        const [f, ratio, a] = pick([['asin', '1/2', 30], ['acos', '1/2', 60], ['atan', '1', 45]]);
        return { q: `${f}(${ratio})`, show: `${f.slice(1)} θ = ${ratio}. θ = ?`, a, why: `${f.slice(1)} ${a}° = ${ratio}, so θ = ${a}°.` };
      },
    }],
    guide: [
      { ch: 0, title: 'Sine, cosine and tangent',
        what: 'For an angle <code>θ</code> in a right triangle, the ratios of the sides are named. Remember them as SOH CAH TOA:',
        tex: '\\sin\\theta = \\frac{\\text{opp}}{\\text{hyp}} \\qquad \\cos\\theta = \\frac{\\text{adj}}{\\text{hyp}} \\qquad \\tan\\theta = \\frac{\\text{opp}}{\\text{adj}}', scene: true },
      { ch: 0, title: 'Finding a side or an angle',
        what: 'Rearrange the ratio to get a side, for example <code>opp = hyp × sin θ</code>. To get an angle from its ratio, use the inverse: <code>sin⁻¹</code> (<code>asin</code>), <code>cos⁻¹</code> (<code>acos</code>) or <code>tan⁻¹</code> (<code>atan</code>).',
        tex: '\\text{opp} = \\text{hyp}\\times\\sin\\theta \\qquad \\theta = \\sin^{-1}\\!\\left(\\frac{\\text{opp}}{\\text{hyp}}\\right)',
        proof: 'Draw two right triangles with the same angle θ, one twice as big. Every side of the big one is twice the matching side of the small one, so opp ÷ hyp comes out the same for both. That is why the ratio depends only on the angle, and why a table of sin θ works for any triangle.' },
    ],
  };
})();
