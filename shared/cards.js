/* Show saved XP on each card, and the playground level on the Trophy Room button. Playgrounds on the same origin share
   localStorage, so this just reads it. A data-subject card takes its keys from shared/catalog.js. */
const keysOf = card => card.dataset.subject
  ? window.Catalog ? Catalog.QUESTS.filter(q => q.subject === card.dataset.subject).map(q => q.key) : []
  : card.dataset.keys ? card.dataset.keys.split(' ') : [card.dataset.key];

document.querySelectorAll('.card[data-key], .card[data-keys], .card[data-subject]').forEach(card => {
  let xp = 0;
  for (const key of keysOf(card)) {
    try {
      const raw = localStorage.getItem(key);
      const v = raw && JSON.parse(raw).xp;
      if (typeof v === 'number' && v > 0) xp += v;
    } catch (e) { /* storage blocked or unreadable: this key adds no XP */ }
  }
  if (xp > 0) {
    card.querySelector('.xp').textContent = xp + ' XP';
    card.querySelector('.go').textContent = 'Continue →';
  }
});

if (window.Trophies) document.querySelectorAll('.trophy-btn').forEach(Trophies.labelButton);
