/* Contracts: data-theme (absent = Auto) overrides each stylesheet's colour scheme, data-story lets trail.css hide the
 * strip, and 'playgrounds:story' tells open pictures to swap. The storage keys hold learners' saved choices: never rename them. */
(() => {
  'use strict';
  const root = document.documentElement;
  const SETTINGS = [
    { id: 'theme', key: 'playgrounds-theme', label: 'Theme', fallback: 'auto',
      note: 'Auto follows your device.',
      options: [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']],
      apply: v => { if (v === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', v); } },
    { id: 'story', key: 'playgrounds-story', label: 'Story', fallback: 'on',
      note: 'Shows "The trail", the story line at the top of each mission.',
      options: [['on', 'On'], ['off', 'Off']],
      apply: (v, changed) => {
        root.setAttribute('data-story', v);
        if (changed) document.dispatchEvent(new CustomEvent('playgrounds:story', { detail: v }));
      } },
  ];

  const load = s => { try { const v = localStorage.getItem(s.key); return s.options.some(o => o[0] === v) ? v : s.fallback; } catch (e) { return s.fallback; } };
  for (const s of SETTINGS) s.apply(load(s), false);

  function mount() {
    const host = document.querySelector('header.top') || document.querySelector('header') || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'st-wrap';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'st-trigger';
    trigger.textContent = 'Settings';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'st-panel');
    const panel = document.createElement('div');
    panel.className = 'st-panel';
    panel.id = 'st-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Settings');
    panel.hidden = true;
    panel.innerHTML = '<h3>Settings</h3><p class="st-note">Saved in this browser and used by every playground.</p>';

    for (const s of SETTINGS) {
      const set = document.createElement('fieldset');
      set.className = 'st-set';
      set.innerHTML = `<legend>${s.label}</legend><div class="st-seg"></div><p class="st-note">${s.note}</p>`;
      const current = load(s);
      for (const [value, text] of s.options) {
        const lab = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'st-' + s.id;
        input.value = value;
        input.checked = value === current;
        input.addEventListener('change', () => {
          try { localStorage.setItem(s.key, value); } catch (e) { /* storage blocked: the choice lasts this visit */ }
          s.apply(value, true);
        });
        lab.append(input, document.createTextNode(text));
        set.querySelector('.st-seg').append(lab);
      }
      panel.append(set);
    }

    const place = () => {
      panel.classList.remove('st-left');
      if (trigger.getBoundingClientRect().right < panel.offsetWidth + 16) panel.classList.add('st-left');
    };
    const toggle = open => {
      open = open == null ? panel.hidden : open;
      panel.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
      if (open) place();
    };
    trigger.addEventListener('click', () => toggle());
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); trigger.focus(); } });
    document.addEventListener('click', e => { if (!panel.hidden && !wrap.contains(e.target)) toggle(false); });
    window.addEventListener('resize', () => { if (!panel.hidden) place(); });

    wrap.append(trigger, panel);
    host.append(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
