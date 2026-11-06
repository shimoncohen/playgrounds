/* Show saved XP on each card. Playgrounds on the same origin share localStorage, so this just reads it. */
document.querySelectorAll('.card[data-key], .card[data-keys]').forEach(card => {
  let xp = 0;
  for (const key of card.dataset.keys ? card.dataset.keys.split(' ') : [card.dataset.key]) {
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
