/* Light / dark theme switch shared by every page.
 *
 * Each stylesheet already themes itself from prefers-color-scheme and lets
 * <html data-theme="light|dark"> override it. This file sets that attribute from the
 * saved choice and adds a button to the page header that cycles Auto -> Light -> Dark.
 * "Auto" removes the attribute, so the page follows the OS again.
 */
(() => {
  'use strict';
  const KEY = 'playgrounds-theme';
  const MODES = ['auto', 'light', 'dark'];
  const LABEL = { auto: 'Auto', light: 'Light', dark: 'Dark' };
  const root = document.documentElement;

  const load = () => { try { const v = localStorage.getItem(KEY); return MODES.includes(v) ? v : 'auto'; } catch (e) { return 'auto'; } };
  const apply = m => { if (m === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', m); };
  let mode = load();
  apply(mode);

  function mount() {
    const host = document.querySelector('header.top') || document.querySelector('header') || document.body;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    const show = () => {
      btn.textContent = 'Theme: ' + LABEL[mode];
      btn.title = 'Switch between Auto (follows your device), Light and Dark';
    };
    btn.addEventListener('click', () => {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      try { localStorage.setItem(KEY, mode); } catch (e) { /* choice just won't persist */ }
      apply(mode);
      show();
    });
    show();
    host.append(btn);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
