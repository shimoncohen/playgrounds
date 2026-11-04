(() => {
'use strict';
MQ.trackApp = C => {
const CH = C.chapters, XP = 10, G = MQ.graph;
const KEY = window.PROGRESS.key;
for (const c of CH) c.tier = c.tier || C.track;
const T = Tiers.create({ tiers: [{ id: C.track, name: G.tracks.find(t => t.id === C.track).name, missionXp: XP }], chapters: CH, baseRanks: C.ranks, tierEndRanks: {} });
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TABS = ['quest', 'fire', 'guide'];
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
const tex = (el, s) => { if (window.katex) katex.render(s, el, { throwOnError: false }); else el.textContent = s; };

function fresh() { return { ch: 0, mi: 0, done: {}, xp: 0, best: 0, badges: {}, tab: 'quest', notes: {}, work: {} }; }
// every field falls back on its own, so one bad value never costs the rest of a save
function load(raw) {
  const S = fresh(); let o = null;
  try { o = JSON.parse(raw); } catch (e) { return S; }
  if (!isObj(o)) return S;
  for (const f of ['done', 'badges']) if (isObj(o[f])) for (const k of Object.keys(o[f])) if (o[f][k] === true) S[f][k] = true;
  for (const f of ['xp', 'best']) if (typeof o[f] === 'number' && Number.isFinite(o[f]) && o[f] >= 0) S[f] = o[f];
  if (Number.isInteger(o.ch) && o.ch >= 0 && o.ch < CH.length) { S.ch = o.ch; if (Number.isInteger(o.mi) && o.mi >= 0 && o.mi <= CH[o.ch].missions.length) S.mi = o.mi; }
  if (TABS.includes(o.tab)) S.tab = o.tab;
  if (isObj(o.notes)) for (const k of Object.keys(o.notes)) if (typeof o.notes[k] === 'string') S.notes[k] = o.notes[k];
  if (isObj(o.work)) for (const k of Object.keys(o.work)) if (Array.isArray(o.work[k])) S.work[k] = o.work[k].filter(v => typeof v === 'string');
  return S;
}
let S = fresh();
try { const raw = localStorage.getItem(KEY); if (raw !== null) S = load(raw); } catch (e) { /* storage blocked: play without saving */ }
let saveT = 0, pending = false;
const write = () => { pending = false; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } };
function save() { pending = true; clearTimeout(saveT); saveT = setTimeout(write, 200); }
addEventListener('pagehide', () => { if (pending) { clearTimeout(saveT); write(); } });

const mkey = () => S.ch + '.' + S.mi;
const curMission = () => CH[S.ch].missions[S.mi] || null;
const totalDone = ci => CH[ci].missions.filter((_, i) => S.done[ci + '.' + i]).length;
const chapterDone = ci => totalDone(ci) === CH[ci].missions.length;
const mq = q => { try { return matchMedia(q).matches; } catch (e) { return false; } };
const reduced = () => mq('(prefers-reduced-motion: reduce)');

const missionEl = $('#mission'), chaptersEl = $('#chapters'), sceneEl = $('#scene'), workEl = $('#work'), fbEl = $('#feedback');

function doneSet() {
  const states = {};
  for (const t of G.tracks) {
    if (t.id === C.track) { states[t.id] = S; continue; }
    try { states[t.id] = JSON.parse(localStorage.getItem(t.key)); } catch (e) { states[t.id] = null; }
  }
  return G.doneFrom(states);
}
const chHref = id => (G.trackOf(id) === C.track ? '' : `../${G.trackOf(id)}/`) + '#ch=' + id;
function prereq() {
  const c = G.chapter(CH[S.ch].id), h = G.hint(c.id, doneSet());
  if (h.ready) return `<div class="prereq ready"><b>Ready</b>: ${c.requires.length ? 'you have done ' + c.requires.map(r => esc(G.chapter(r).title)).join(', ') + '.' : 'this chapter needs nothing first.'}</div>`;
  const name = t => G.tracks.find(x => x.id === t).name;
  return `<div class="prereq"><b>Suggested first:</b> ${h.missing.map(m => `<a href="${chHref(m.id)}">${esc(m.title)}</a> (${esc(name(m.track))})`).join(', ')}, not done yet. <span class="why">It helps because ${esc(h.missing[0].why)}. Nothing is locked: you can start here too.</span></div>`;
}

let scene = null, work = null, won = false, quiet = false, lastWhy = '';
function startSession(fill) {
  if (scene) scene.destroy();
  const m = curMission(), ch = CH[S.ch], k = mkey();
  won = false; lastWhy = ''; renderFeedback(null);
  let moved = false;
  scene = MQ.scene.mount(sceneEl, MQ.scene.forMission(ch, m, fill), { onChange: st => {
    if (!m || m.kind !== 'scene' || won) return;
    const r = m.check(st);
    if (r.ok) { complete(); return; }
    // the first call is the scene as it starts: say nothing until the learner moves something
    if (moved && r.why !== lastWhy) { lastWhy = r.why; renderFeedback({ tip: r.why }); }
    moved = true;
  } });
  workEl.hidden = !m || m.kind === 'scene';
  if (workEl.hidden) { workEl.replaceChildren(); work = null; return; }
  quiet = !fill;
  work = MQ.work.mount(workEl, m, { saved: fill ? (m.steps || [m.answer]) : S.work[k], onPass: steps => {
    S.work[k] = steps; save();
    if (quiet) { won = true; renderFeedback({ again: true }); } else complete();
  } });
  work.ready.then(() => { quiet = false; });
}
function complete() {
  if (won) return; won = true;
  const k = mkey(), first = !S.done[k], had = chapterDone(S.ch);
  let badge = false;
  if (first) { S.done[k] = true; S.xp += XP; if (!had && chapterDone(S.ch)) { S.badges[S.ch] = true; S.xp += T.chapterBadgeXp; badge = true; } pop = true; save(); }
  renderFeedback({ win: true, first, badge });
  renderChapters(); renderMission(); renderXP();
}
const nextBtn = () => `<button type="button" class="btn" data-act="next">${S.mi >= CH[S.ch].missions.length - 1 ? 'Finish the chapter' : 'Next mission'} →</button>`;
function renderFeedback(f) {
  if (!f) { fbEl.innerHTML = ''; return; }
  if (f.win) { fbEl.innerHTML = `<div class="msg win"><span class="h">${f.first ? 'Mission complete! +' + XP + ' XP' : 'Mission complete (you had already earned this one)'}${f.badge ? ' · Badge earned: ' + esc(CH[S.ch].badge) + ' +' + T.chapterBadgeXp + ' XP' : ''}</span><div class="actions">${nextBtn()}</div></div>`; return; }
  if (f.again) { fbEl.innerHTML = `<div class="msg win"><span class="h">You solved this one before</span><p>Your working is below. Change it as much as you like.</p><div class="actions">${nextBtn()}</div></div>`; return; }
  fbEl.innerHTML = `<div class="msg tip"><span class="h">Not quite yet</span><p>${esc(f.tip)}</p></div>`;
}
fbEl.addEventListener('click', e => { const b = e.target.closest('[data-act="next"]'); if (b) gotoMission(S.ch, S.mi + 1); });

let pop = false;
function renderChapters() {
  Tiers.renderRail(chaptersEl, { status: T.status(S), chapters: CH, S, onPick: ci => {
    let mi = CH[ci].missions.findIndex((_, i) => !S.done[ci + '.' + i]); if (mi < 0) mi = 0;
    gotoMission(ci, mi); const c = chaptersEl.querySelector(`[data-ch="${ci}"]`); if (c) c.focus({ preventScroll: true });
  } });
}
function renderMission() {
  const ch = CH[S.ch], n = ch.missions.length;
  const dots = `<div class="dots" aria-label="Missions in this chapter">${ch.missions.map((m, i) => `<button class="dot${S.done[S.ch + '.' + i] ? ' done' : ''}${i === S.mi ? ' cur' : ''}" data-mi="${i}" title="${esc(m.title)}" aria-label="Mission ${i + 1}: ${esc(m.title)}${S.done[S.ch + '.' + i] ? ' (done)' : ''}"${i === S.mi ? ' aria-current="step"' : ''}>${i + 1}</button>`).join('')}</div>`;
  let h;
  if (S.mi >= n) {
    const all = chapterDone(S.ch), last = S.ch === CH.length - 1;
    h = `<div class="eyebrow">Chapter ${S.ch + 1} complete</div><div class="badge-art${all ? '' : ' dim'}" aria-hidden="true">${all ? '★' : S.ch + 1}</div>
    <h2>${all ? 'Badge earned: ' + esc(ch.badge) : 'Chapter finished'}</h2>
    <p class="explain">${all ? 'Every mission in this chapter is done.' : 'A few missions are still open: the dots below show which.'} The scene is still live, so keep playing with it as long as you like.</p>
    ${last ? `<p class="note">That is every chapter in this track for now. Play Quick-fire to keep it fresh, or see what comes next on the <a href="../">Math Quest map</a>.</p><div class="actions"><button class="btn" data-act="tab-fire">Play Quick-fire</button><button class="btn ghost" data-act="tab-guide">Open the field guide</button></div>`
      : `<div class="actions"><button class="btn" data-act="nextch">Start chapter ${S.ch + 2}: ${esc(CH[S.ch + 1].name)}</button></div>`}${dots}`;
  } else {
    const m = ch.missions[S.mi];
    h = `<div class="eyebrow">Chapter ${S.ch + 1} · Mission ${S.mi + 1} of ${n}${S.done[mkey()] ? ' · done ✓' : ''}</div>
    ${prereq()}
    <h2>${esc(m.title)}</h2>
    <div class="goal"><div class="label">Your goal</div><p>${m.goal}</p></div>
    <button type="button" class="btn ghost narrow-only" data-act="towork">${m.kind === 'scene' ? 'Go to the scene' : 'Go to your working'} ↓</button>
    ${HowSteps.html(m.how)}
    <p class="explain">${m.explain}</p>
    <details class="hint"><summary>Show a hint</summary><p>${m.hint}</p></details>
    <div class="actions"><button class="btn ghost" data-act="fill">${m.kind === 'scene' ? 'Set it for me' : 'Type it for me'}</button></div>
    <details class="about"${S.mi === 0 && !S.done[mkey()] ? ' open' : ''}><summary>About this chapter</summary><p class="intro">${ch.intro}</p></details>${dots}`;
  }
  missionEl.innerHTML = h;
  if (pop) { missionEl.classList.remove('pop'); void missionEl.offsetWidth; missionEl.classList.add('pop'); pop = false; }
}
missionEl.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.mi !== undefined) { gotoMission(S.ch, +b.dataset.mi); const d = missionEl.querySelector(`[data-mi="${S.mi}"]`); if (d) d.focus({ preventScroll: true }); return; }
  const a = b.dataset.act;
  if (a === 'towork') (workEl.hidden ? sceneEl : workEl).scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
  else if (a === 'fill') startSession(true);
  else if (a === 'nextch') gotoMission(S.ch + 1, 0);
  else if (a && a.startsWith('tab-')) showTab(a.slice(4), true);
});
function gotoMission(ci, mi) {
  if (!CH[ci]) return;
  const chChanged = ci !== S.ch;
  S.ch = ci; S.mi = Math.max(0, Math.min(mi, CH[ci].missions.length)); save();
  renderChapters(); renderMission(); startSession(); if (chChanged) renderNotes();
  if (innerWidth < 820) missionEl.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
}
function renderNotes() { const el = $('#notes'); el.replaceChildren(); MQ.work.notes(el, S.notes[S.ch], v => { S.notes[S.ch] = v; save(); }); }

function renderXP() {
  const r = T.rankFor(S.xp);
  $('#rank').textContent = r.name; $('#xpText').textContent = S.xp + ' XP';
  $('#xpFill').style.width = (r.hi > r.lo ? Math.min(100, (S.xp - r.lo) / (r.hi - r.lo) * 100) : 100) + '%';
}

function showTab(t, user) {
  if (!TABS.includes(t)) t = 'quest';
  if (user && S.tab !== t) { S.tab = t; save(); } else S.tab = t;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  TABS.forEach(x => { $('#tab-' + x).hidden = x !== t; });
  if (t !== 'fire') stopFire(true);
  if (t === 'guide' && !$('#guide').dataset.ready) renderGuide();
  if (t === 'fire' && !fireOn) fireIdle();
}
$('.tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab, true); });
$('.tabs').addEventListener('keydown', e => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const bs = [...document.querySelectorAll('.tabs button[data-tab]')];
  let i = bs.findIndex(b => b.getAttribute('aria-selected') === 'true');
  i = (i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length; showTab(bs[i].dataset.tab, true); bs[i].focus();
});
// #ch=<chapter id> opens that chapter; #guide and #fire open those tabs. Returns false when the hash names nothing here.
function fromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === 'guide' || h === 'fire') { showTab(h, true); return true; }
  const m = /^ch=(.+)$/.exec(h), ci = m ? CH.findIndex(c => c.id === m[1]) : -1;
  if (ci < 0) return false;
  let mi = CH[ci].missions.findIndex((_, i) => !S.done[ci + '.' + i]); if (mi < 0) mi = CH[ci].missions.length;
  showTab('quest', true); gotoMission(ci, mi); return true;
}
addEventListener('hashchange', fromHash);

// quick-fire pays no XP: ranks come from missions
const ROUND = 75, fStage = $('#fStage');
let fireOn = false, fT = 0, fLeft = ROUND, fScore = 0, fStreak = 0, fQ = null, fMiss = [], fLocked = false, fNext = 0, fRng = null;
function setStats() { $('#fScore').textContent = fScore; $('#fStreak').textContent = fStreak; $('#fBest').textContent = S.best; $('#fTime').textContent = fLeft; $('#fTimer').style.width = (fLeft / ROUND * 100) + '%'; }
// a template is in the pool once every mission of its chapter is done, so nothing is asked before it was taught
const qfPool = () => C.quickfire.filter(q => chapterDone(q.ch));
function fireIdle() {
  if (!qfPool().length) {
    const open = CH.map((c, i) => i).filter(i => !chapterDone(i) && C.quickfire.some(q => q.ch === i));
    fStage.innerHTML = `<p class="explain">Quick-fire asks about what the missions have taught, so it opens once you finish them. ${open.map(i => `Finish <b>Chapter ${i + 1}: ${esc(CH[i].name)}</b> (${totalDone(i)} of ${CH[i].missions.length} missions done) first.`).join(' ')}</p>
    <div class="actions"><button class="btn" data-act="tab-quest">Back to the missions</button></div>`;
    setStats(); return;
  }
  fStage.innerHTML = `<p class="explain">You get one sum at a time: type the answer and press <kbd>Enter</kbd>. The clock runs for ${ROUND} seconds, and every right answer in a row adds a streak bonus. Your best score is kept, and nothing here changes your XP.</p>
  <div class="actions"><button class="btn" id="fStart">Start the clock</button></div>`;
  setStats();
}
function nextQ() {
  const pool = qfPool(); fQ = pool[Math.floor(fRng() * pool.length)].make(fRng); fLocked = false;
  fStage.innerHTML = `<div class="task">${esc(fQ.show)}</div><form class="qform" id="fForm" autocomplete="off"><label class="sr" for="fAns">Your answer</label><input id="fAns" inputmode="text" enterkeyhint="send" autocomplete="off" spellcheck="false"><button class="btn" type="submit">Check</button></form>
  <p class="fb" id="fFb" aria-live="polite"></p><div class="actions"><button class="btn ghost" id="fStop">End round</button></div>`;
  $('#fAns').focus({ preventScroll: true });
}
function answer(v) {
  if (!fireOn || fLocked || !fQ) return;
  const fb = $('#fFb');
  if (!v.trim()) { fb.className = 'fb bad'; fb.textContent = 'Type a number first.'; return; }
  fLocked = true;
  const ok = MQ.check.quick(v, fQ.q);
  if (ok) { fStreak++; const pts = 10 + Math.min(fStreak - 1, 5) * 2; fScore += pts; fb.className = 'fb good'; fb.textContent = `Right! +${pts}${fStreak > 1 ? ` (streak ${fStreak})` : ''}`; }
  else { fStreak = 0; fMiss.push(fQ); fb.className = 'fb bad'; fb.textContent = `Not this time: it is ${fQ.a}. ${fQ.why}`; }
  setStats(); clearTimeout(fNext); fNext = setTimeout(() => { if (fireOn) nextQ(); }, ok ? 700 : 2600);
}
function startFire() {
  if (!qfPool().length) { fireIdle(); return; }
  fRng = MQ.rng(Date.now() >>> 0); fireOn = true; fLeft = ROUND; fScore = 0; fStreak = 0; fMiss = []; setStats(); nextQ();
  clearInterval(fT); fT = setInterval(() => { fLeft--; setStats(); if (fLeft <= 0) stopFire(); }, 1000);
}
function stopFire(silent) {
  if (!fireOn) return; fireOn = false; clearInterval(fT); clearTimeout(fNext);
  if (silent) { fLeft = ROUND; fScore = 0; fStreak = 0; fireIdle(); return; }
  if (fScore > S.best) { S.best = fScore; save(); }
  setStats();
  fStage.innerHTML = `<div class="task">Round over: ${fScore} points</div><p class="note">${fScore >= S.best && fScore > 0 ? 'That is your best score so far.' : `Your best is ${S.best}.`}</p>
  ${fMiss.length ? `<div><p class="explain"><b>Worth another look:</b></p><ul class="misses">${fMiss.map(q => `<li><span>${esc(q.show)}</span><span>Answer: <b>${q.a}</b></span><span class="note">${esc(q.why)}</span></li>`).join('')}</ul></div>` : '<p class="explain">No misses. Every answer was right.</p>'}
  <div class="actions"><button class="btn" id="fStart">Play again</button></div>`;
}
fStage.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.act === 'tab-quest') showTab('quest', true); else if (b.id === 'fStart') startFire(); else if (b.id === 'fStop') stopFire(); });
fStage.addEventListener('submit', e => { e.preventDefault(); answer($('#fAns').value); });

function renderGuide() {
  const g = $('#guide'); g.dataset.ready = '1';
  g.innerHTML = `<div><h2>Field guide</h2><p class="lede">The ideas the missions teach, each with a picture or an example to try.</p></div>
  ${CH.map((c, ci) => `<section class="gsec"><h3>Chapter ${ci + 1}: ${esc(c.name)}</h3><div class="cards">${C.guide.map((x, i) => x.ch !== ci ? '' : `<article class="card panel${x.scene ? ' wide' : ''}"><h4>${esc(x.title)}</h4><p>${x.what}</p>${x.tex ? `<div class="gtex" data-i="${i}"></div>` : ''}${x.scene ? `<div class="gscene" data-i="${i}"></div>` : ''}${x.proof ? `<p class="note"><b>Why it works:</b> ${x.proof}</p>` : ''}</article>`).join('')}</div></section>`).join('')}
  <section class="gsec"><div class="panel" style="padding:14px 16px"><button class="linkbtn" id="resetProgress">Reset all progress in this track</button></div></section>`;
  g.querySelectorAll('.gtex').forEach(el => tex(el, C.guide[+el.dataset.i].tex));
  g.querySelectorAll('.gscene').forEach(el => MQ.scene.mount(el, CH[C.guide[+el.dataset.i].ch].scene));
}
let armProg = 0;
$('#guide').addEventListener('click', e => {
  const b = e.target.closest('#resetProgress'); if (!b) return;
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Click again to erase your XP, finished missions, notes and working'; clearTimeout(armProg); armProg = setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Reset all progress in this track'; }, 4000); return; }
  S = fresh(); save(); renderXP(); showTab('quest', true); gotoMission(0, 0); renderNotes();
});

// without a hash, boot reads the save and never writes it
renderXP(); renderChapters(); renderMission(); startSession(); renderNotes();
if (!fromHash()) showTab(S.tab);
};
})();
