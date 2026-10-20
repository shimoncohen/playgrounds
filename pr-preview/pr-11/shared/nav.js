/* Links shared by every playground: a way back to the landing page (in the header) and a feature-request
 * button (in a footer line). Load after the header exists (end of <body>). The back link only appears on pages served from a
 * <name>-quest/ folder, so it stays out of the claude.ai artifact bundle, where "../" leads nowhere. */
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

  if (/-quest\/(index\.html)?$/.test(location.pathname)) {
    const up = location.protocol === 'file:' ? '../index.html' : '../';
    host.prepend(link('nv-home', up, icon('← '), 'All playgrounds'));
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
