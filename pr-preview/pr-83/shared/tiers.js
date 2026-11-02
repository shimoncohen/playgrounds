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

  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* DOM helper: draws a header per tier that has chapters, then that tier's chapter buttons.
     Chapter button markup is the original flat-list markup (golden test depends on it). */
  function renderRail(container, o) {
    const { status, chapters, S, onPick } = o;
    const doneIn = (i) => {
      let n = 0;
      for (let j = 0; j < chapters[i].missions.length; j++) if (S.done[i + '.' + j]) n++;
      return n;
    };
    const btn = (c, i) => `<button class="chap${S.badges[i] ? ' earned' : ''}" data-ch="${i}" aria-current="${i === S.ch}"><span class="num">${S.badges[i] ? '★' : i + 1}</span><span class="nm">${esc(c.name)}</span><span class="ct">${doneIn(i)}/${c.missions.length}</span></button>`;
    container.innerHTML = status.filter((st) => st.chapters.length).map((st) =>
      `<div class="tierhead${st.complete ? ' complete' : ''}" data-tier="${esc(st.tier.id)}"><span class="tn">${esc(st.tier.name)}</span><span class="tc">${st.chaptersDone}/${st.chapters.length}</span>${st.complete ? '<span class="tb" aria-label="Tier complete">★</span>' : ''}</div>`
      + st.chapters.map((i) => btn(chapters[i], i)).join('')).join('');
    if (onPick) container.onclick = (e) => {
      const b = e.target.closest && e.target.closest('[data-ch]');
      if (b) onPick(+b.dataset.ch);
    };
  }

  root.Tiers = { create, renderRail };
})(typeof window !== 'undefined' ? window : globalThis);
