/* Tier model: pure (no DOM). Tiers.create(cfg) -> tier/XP/rank helpers.
   cfg.chapters is read by reference at call time, so content may be appended after create(). */
(function (root) {
  const BADGE_XP = 25;

  function create(cfg) {
    const tiers = cfg.tiers;
    const byId = (id) => tiers.find((t) => t.id === id);
    const chaptersOf = (id) => {
      const out = [];
      cfg.chapters.forEach((c, i) => { if (c.tier === id) out.push(i); });
      return out;
    };
    const tierOf = (ch) => {
      const c = cfg.chapters[ch];
      return (c && byId(c.tier)) || tiers[0];
    };
    const missionXp = (ch) => tierOf(ch).missionXp;

    function cumulativeXp(tierId) {
      let sum = 0;
      for (const t of tiers) {
        for (const i of chaptersOf(t.id)) sum += cfg.chapters[i].missions.length * t.missionXp + BADGE_XP;
        if (t.id === tierId) break;
      }
      return sum;
    }

    function status(S) {
      return tiers.map((tier) => {
        const chapters = chaptersOf(tier.id);
        let missionsDone = 0, missionsTotal = 0, chaptersDone = 0;
        for (const i of chapters) {
          const n = cfg.chapters[i].missions.length;
          missionsTotal += n;
          for (let j = 0; j < n; j++) if (S.done && S.done[i + '.' + j]) missionsDone++;
          if (S.badges && S.badges[i]) chaptersDone++;
        }
        return { tier, chapters, chaptersDone, missionsDone, missionsTotal,
          complete: chapters.length > 0 && chaptersDone === chapters.length };
      });
    }

    function ranks() {
      const out = cfg.baseRanks.map((r) => r.slice());
      for (const t of tiers) {
        const name = cfg.tierEndRanks[t.id];
        if (name && chaptersOf(t.id).length) out.push([cumulativeXp(t.id), name]);
      }
      return out;
    }

    function rankFor(xp) {
      const r = ranks();
      let i = 0;
      while (i + 1 < r.length && xp >= r[i + 1][0]) i++;
      const lo = r[i][0];
      return { name: r[i][1], index: i, lo, hi: i + 1 < r.length ? r[i + 1][0] : lo };
    }

    return { tierOf, missionXp, chapterBadgeXp: BADGE_XP, status, ranks, rankFor, cumulativeXp };
  }

  root.Tiers = { create };
})(typeof window !== 'undefined' ? window : globalThis);
