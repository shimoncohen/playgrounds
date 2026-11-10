/* data-story on <html> is the contract with trail.css (Off hides the strip); Trail.html takes authored HTML-safe story text. */
(() => {
  'use strict';
  const KEY = 'playgrounds-story';
  const root = document.documentElement;

  const load = () => { try { return localStorage.getItem(KEY) === 'off' ? 'off' : 'on'; } catch (e) { return 'on'; } };
  let mode = load();
  root.setAttribute('data-story', mode);

  window.Trail = {
    html: story => story ? `<p class="trail"><span class="trail-tag">The trail</span>${story}</p>` : '',
  };

  function mount() {
    const host = document.querySelector('header.top') || document.querySelector('header') || document.body;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'story-toggle';
    const show = () => {
      btn.textContent = 'Story: ' + (mode === 'on' ? 'On' : 'Off');
      btn.title = 'Show or hide "The trail", the story line at the top of each mission';
    };
    btn.addEventListener('click', () => {
      mode = mode === 'on' ? 'off' : 'on';
      try { localStorage.setItem(KEY, mode); } catch (e) { /* choice just won't persist */ }
      root.setAttribute('data-story', mode);
      show();
    });
    show();
    host.append(btn);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
