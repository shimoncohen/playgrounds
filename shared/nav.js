/* Links shared by every playground: a way back to the landing page (in the header) and a feature-request
 * button (in a footer line). Load after the header exists (end of <body>). The back link only appears on pages served from a
 * <name>-quest/, math/, programming/ or trophy-room/ folder, so it stays out of the claude.ai artifact bundle, where "../" leads nowhere. */
(() => {
  'use strict';
  const host = document.querySelector('header.top');
  if (!host) return;
  const REPO = 'https://github.com/shimoncohen/playgrounds';

  const link = (cls, href, ...kids) => {
    const a = document.createElement('a');
    a.className = 'nv-link ' + cls;
    a.href = href;
    a.append(...kids);
    return a;
  };
  const icon = text => {
    const s = document.createElement('span');
    s.setAttribute('aria-hidden', 'true');
    s.textContent = text;
    return s;
  };

  // Pages one folder deeper (a Math track, a quest in programming/) climb one more level to get home.
  const at = /\/((?:programming\/)?\w+-quest\/(?:\w+\/)?|math\/(?:\w+\/)?|programming\/|trophy-room\/)(?:index\.html)?$/.exec(location.pathname);
  if (at) {
    const root = '../'.repeat(at[1].split('/').length - 1);
    const page = location.protocol === 'file:' ? 'index.html' : '';
    const home = link('nv-home', root + page, icon('← '), 'All playgrounds');
    host.prepend(home);
    if (at[1] !== 'trophy-room/') {
      const lvl = document.createElement('span');
      lvl.className = 'lvl';
      lvl.textContent = 'Trophy Room';
      const trophy = link('nv-trophy trophy-btn', root + 'trophy-room/' + page, icon('🏆 '), lvl);
      home.after(trophy);
      // Quest pages don't load the catalog, so fetch the two small scripts only where this button is shown.
      const load = src => new Promise((done, fail) => {
        const s = document.createElement('script');
        s.src = root + 'shared/' + src;
        s.onload = done;
        s.onerror = fail;
        document.head.append(s);
      });
      (window.Trophies ? Promise.resolve() : load('catalog.js').then(() => load('trophies.js')))
        .then(() => window.Trophies.labelButton(trophy), () => { /* scripts did not load: keep the plain label */ });
    }
  }

  const idea = link('nv-idea', REPO + '/issues/new?template=feature-request.yml', 'Open a feature request');
  idea.target = '_blank';
  idea.rel = 'noopener noreferrer';
  const foot = document.createElement('footer');
  foot.className = 'nv-foot';
  foot.append(icon('\uD83D\uDCA1 '), 'Have an idea? ', idea);
  document.body.append(foot);

  // The pinned mission column needs to fit under the header at the top of the page, so its height is
  // measured from where the quest grid starts (the header wraps at some widths) rather than guessed.
  const measure = () => {
    const quest = document.querySelector('.quest');
    if (!quest || !quest.offsetParent) return;
    document.documentElement.style.setProperty('--qtop', Math.round(quest.getBoundingClientRect().top + scrollY) + 'px');
  };
  measure();
  addEventListener('resize', measure);
  addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
})();
