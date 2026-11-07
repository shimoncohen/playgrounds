(() => {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const num = n => n.toLocaleString('en-US');
  const bar = (label, now, max) => `<div class="bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${now}"><i style="width:${max ? Math.min(100, now / max * 100) : 0}%"></i></div>`;
  const status = a => {
    const left = a.progress ? ` (${a.progress.have} of ${a.progress.need})` : '';
    if (!a.earned) return 'Locked: ' + esc(a.condition) + left;
    return a.progress ? 'Earned. Next: ' + esc(a.condition) + left : 'Earned';
  };

  function storage() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  function render() {
    const S = Trophies.summary(storage(), Catalog);
    const L = S.level;
    const earned = S.achievements.filter(a => a.earned).length;
    document.getElementById('room').innerHTML = `
<section class="box level" aria-labelledby="lv-h">
  <div class="ring" aria-hidden="true">${L.n}</div>
  <h2 id="lv-h">Level ${L.n} · ${esc(L.title)}</h2>
  <p class="muted">${num(S.xp)} XP</p>
  ${bar(`Progress to level ${L.n + 1}`, S.xp - L.lo, L.hi - L.lo)}
  <p class="muted">${num(L.hi - S.xp)} XP to Level ${L.n + 1}</p>
  ${S.xp === 0 && !S.quests.some(q => q.started) ? '<p class="empty">Finish a mission in any playground to start filling this room. Try <a href="../programming/">Programming</a> or <a href="../math/">Math</a>.</p>' : ''}
</section>
<section class="box" aria-labelledby="sb-h">
  <h2 id="sb-h">Subjects</h2>
  ${S.subjects.map(s => `<div class="subject">
    <div class="row"><a href="../${s.href}">${esc(s.name)}</a><span class="muted">${s.complete} of ${s.quests} ${esc(s.unit)} finished · ${s.chaptersDone} ${s.chaptersDone === 1 ? 'chapter' : 'chapters'}</span></div>
    ${bar(`${s.name}: ${s.complete} of ${s.quests} ${s.unit} finished`, s.complete, s.quests)}
  </div>`).join('')}
</section>
<section class="box" aria-labelledby="qs-h">
  <h2 id="qs-h">Playgrounds</h2>
  ${S.subjects.map(s => `<h3>${esc(s.name)}</h3><ul class="quests">${S.quests.filter(q => q.subject === s.id).map(q => `<li class="row">
    <a href="../${q.href}">${esc(q.name)}</a>
    <span class="muted">${q.started ? `${q.chaptersDone} / ${q.chaptersTotal} chapters · ${num(q.xp)} XP` : 'Not started'}${q.complete ? ' <span class="pill">Done</span>' : ''}</span>
  </li>`).join('')}</ul>`).join('')}
</section>
<section aria-labelledby="ac-h">
  <h2 id="ac-h">Achievements · ${earned} of ${S.achievements.length}</h2>
  <ul class="ach">${S.achievements.map(a => `<li class="a${a.earned ? '' : ' off'}">
    <span class="icon" aria-hidden="true">${a.icon}</span><b>${esc(a.name)}</b><span class="cond">${status(a)}</span>
  </li>`).join('')}</ul>
  <p class="muted small">New playgrounds join the "every playground" achievements when they launch.</p>
</section>`;
  }

  render();
  // Coming back with the browser's back button can show a cached page from before the latest mission.
  addEventListener('pageshow', e => { if (e.persisted) render(); });
})();
