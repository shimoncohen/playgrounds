/* Trophy Room numbers, worked out on every read from the saves the playgrounds already keep; nothing here is stored.
   DOM-free except labelButton. */
(function (root) {
  const LEVEL_STEP = 20;
  const TITLES = [[20, 'Legend'], [15, 'Veteran'], [10, 'Regular'], [5, 'Explorer'], [1, 'Visitor']];
  const MEDALS = [[10, 'bronze', '🥉'], [25, 'silver', '🥈'], [50, 'gold', '🥇']];
  const INDEX = /^(0|[1-9]\d*)$/;
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
  const count = (xs, f) => xs.filter(f).length;

  // Harbor Quest discards a save without v:1, d and k and starts fresh, so the room must not count one either.
  const usable = (q, o) => isObj(o) && (q.key !== 'harbor-quest-v1' || (o.v === 1 && !!o.d && !!o.k));

  function readSave(storage, q) {
    try {
      const o = JSON.parse(storage.getItem(q.key));
      return usable(q, o) ? o : null;
    } catch (e) {
      return null;
    }
  }

  function questStats(q, save) {
    const s = isObj(save) ? save : {};
    const done = isObj(s.done) ? s.done : {};
    const perChapter = q.missions.map(() => 0);
    for (const k of Object.keys(done)) {
      const parts = k.split(q.sep);
      if (!done[k] || parts.length !== 2 || !INDEX.test(parts[0]) || !INDEX.test(parts[1])) continue;
      const c = +parts[0], m = +parts[1];
      if (c < q.missions.length && m < q.missions[c]) perChapter[c]++;
    }
    const missionsDone = sum(perChapter, n => n);
    const missionsTotal = sum(q.missions, n => n);
    return {
      key: q.key, name: q.name, subject: q.subject, href: q.href,
      xp: typeof s.xp === 'number' && Number.isFinite(s.xp) && s.xp > 0 ? s.xp : 0,
      missionsDone, missionsTotal,
      chaptersDone: count(perChapter, (n, c) => n === q.missions[c]), chaptersTotal: q.missions.length,
      started: missionsDone > 0, complete: missionsDone === missionsTotal,
    };
  }

  function level(xp) {
    const n = Math.floor(Math.sqrt(Math.max(0, xp) / LEVEL_STEP)) + 1;
    return { n, title: TITLES.find(([min]) => n >= min)[1], lo: LEVEL_STEP * (n - 1) ** 2, hi: LEVEL_STEP * n ** 2 };
  }

  const subjectStats = (stats, subjects) => subjects.map(s => {
    const qs = stats.filter(q => q.subject === s.id);
    return { id: s.id, name: s.name, href: s.href, unit: s.unit, quests: qs.length,
      started: count(qs, q => q.started), complete: count(qs, q => q.complete), chaptersDone: sum(qs, q => q.chaptersDone), xp: sum(qs, q => q.xp) };
  });

  // progress is set only while there is something left to reach, so an earned tile never shows "3 of 3".
  const toward = (have, need, earned) => (earned ? undefined : { have: Math.min(have, need), need });

  function achievements(stats, subjects) {
    const started = count(stats, q => q.started), complete = count(stats, q => q.complete);
    const chapters = sum(stats, q => q.chaptersDone);
    const medal = [...MEDALS].reverse().find(([n]) => chapters >= n);
    const nextMedal = MEDALS.find(([n]) => chapters < n);
    const all = qs => qs.length > 0 && qs.every(q => q.complete);
    const of = id => stats.filter(q => q.subject === id);
    return [
      { id: 'first-steps', name: 'First Steps', icon: '👣', earned: started > 0, condition: 'Finish any mission.' },
      { id: 'curious', name: 'Curious', icon: '🧭', earned: started >= 3, condition: 'Start 3 different playgrounds.', progress: toward(started, 3, started >= 3) },
      { id: 'wanderer', name: 'Wanderer', icon: '🗺️', earned: started === stats.length, condition: 'Start every playground.', progress: toward(started, stats.length, started === stats.length) },
      { id: 'chapter-chaser', name: medal ? `Chapter Chaser (${medal[1]})` : 'Chapter Chaser', icon: medal ? medal[2] : MEDALS[0][2], earned: !!medal,
        condition: nextMedal ? `Finish ${nextMedal[0]} chapters for ${nextMedal[1]}.` : 'Every medal won.', progress: nextMedal && { have: chapters, need: nextMedal[0] } },
      { id: 'finisher', name: 'Finisher', icon: '🏁', earned: complete > 0, condition: 'Finish every chapter of one playground.' },
      ...subjects.map(s => {
        const qs = of(s.id), done = count(qs, q => q.complete);
        return { id: 'master-' + s.id, name: 'Playground Master: ' + s.name, icon: s.icon, earned: all(qs),
          condition: `Finish every ${s.name} playground.`, progress: toward(done, qs.length, all(qs)) };
      }),
      { id: 'polymath', name: 'Polymath', icon: '🎓', earned: subjects.every(s => of(s.id).some(q => q.chaptersDone > 0)),
        condition: `Finish a chapter in ${subjects.map(s => s.name).join(' and ')}.` },
      { id: 'grand-master', name: 'Grand Master', icon: '👑', earned: all(stats), condition: 'Finish every playground.', progress: toward(complete, stats.length, all(stats)) },
    ];
  }

  function summary(storage, catalog) {
    const quests = catalog.QUESTS.map(q => questStats(q, readSave(storage, q)));
    const xp = sum(quests, q => q.xp);
    return { xp, level: level(xp), quests, subjects: subjectStats(quests, catalog.SUBJECTS), achievements: achievements(quests, catalog.SUBJECTS) };
  }

  function labelButton(a) {
    let storage = null;
    try { storage = root.localStorage; } catch (e) { /* storage blocked: level 1 */ }
    const n = summary(storage, root.Catalog).level.n;
    const lvl = a.querySelector('.lvl');
    if (lvl) lvl.textContent = 'Level ' + n;
    a.setAttribute('aria-label', 'Trophy Room, level ' + n);
    a.title = 'Trophy Room, level ' + n;
  }

  root.Trophies = { readSave, questStats, level, subjectStats, achievements, summary, labelButton };
})(typeof window !== 'undefined' ? window : globalThis);
