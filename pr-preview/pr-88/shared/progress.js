/* Progress backup for the quest playgrounds.
 *
 * Each playground keeps its whole state as one JSON string in localStorage under
 * window.PROGRESS.key. This file adds a "Progress" control to the page header that
 * lets people keep a copy outside the browser:
 *   - Export / Import: download or load a .json file (works everywhere).
 *   - Auto-save file: Chromium browsers can link one file and rewrite it on every
 *     save (File System Access API). The file handle is kept in IndexedDB.
 *   - navigator.storage.persist() is requested once, after the first save, so the
 *     browser doesn't evict the data when disk is low.
 * It never reads or changes the game logic: it watches localStorage writes to the key.
 *
 * Set before loading this script:  window.PROGRESS = {key:'shell-quest-v1', name:'Shell Quest'}
 */
(() => {
  'use strict';
  const cfg = window.PROGRESS;
  if (!cfg || !cfg.key) return;
  let ls;
  try { ls = window.localStorage; ls.length; } catch (e) { return; }

  const KEY = cfg.key;
  const APP = KEY.replace(/-v\d+$/, '');
  const FORMAT = 'playgrounds-progress';
  const PICK_TYPES = [{ description: 'Progress file', accept: { 'application/json': ['.json'] } }];
  const rawSet = Storage.prototype.setItem;
  const rawGet = Storage.prototype.getItem;

  /* ---------- watch writes to our key ---------- */
  let frozen = false; // true while a restore is reloading the page, so the old state can't overwrite it
  let saveTimer = 0;
  Storage.prototype.setItem = function (k, v) {
    if (this === ls && k === KEY) {
      if (frozen) return;
      rawSet.call(this, k, v);
      afterSave();
      return;
    }
    return rawSet.call(this, k, v);
  };

  // Every playground starts from a state with xp 0 and nothing done, and writes it on load,
  // so "empty" has to mean "no progress", not "no key".
  const pristine = d => !d || typeof d !== 'object' || (d.xp === 0 && (!d.done || Object.keys(d.done).length === 0));
  const hasProgress = () => {
    const raw = rawGet.call(ls, KEY);
    if (raw === null) return false;
    try { return !pristine(JSON.parse(raw)); } catch (e) { return true; }
  };

  function snapshot() {
    const raw = rawGet.call(ls, KEY);
    if (raw === null) return null;
    let data;
    try { data = JSON.parse(raw); } catch (e) { return null; }
    return { format: FORMAT, app: APP, version: 1, savedAt: new Date().toISOString(), data };
  }

  function parseFile(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { throw new Error("That file isn't valid JSON."); }
    if (!o || o.format !== FORMAT) throw new Error("That doesn't look like a playground progress file.");
    if (o.app !== APP) throw new Error('That file belongs to "' + o.app + '", not "' + APP + '".');
    if (!o.data || typeof o.data !== 'object' || Array.isArray(o.data)) throw new Error('The file has no progress data in it.');
    return o;
  }

  function restore(o) {
    frozen = true;
    rawSet.call(ls, KEY, JSON.stringify(o.data));
    location.reload();
  }

  const confirmReplace = () =>
    !hasProgress() || confirm('Replace the progress in this browser with the progress from the file? Your current progress will be overwritten.');

  /* ---------- export / import ---------- */
  function exportFile() {
    const snap = snapshot();
    if (!snap) return say('Nothing to export yet. Complete a step first, then try again.', true);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' }));
    a.download = APP + '-progress.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say('Exported ' + a.download + '. Keep it somewhere safe.');
  }

  async function importFromInput(input) {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    try {
      const o = parseFile(await f.text());
      if (confirmReplace()) restore(o);
    } catch (e) { say(e.message, true); }
  }

  /* ---------- linked save file (File System Access API) ---------- */
  const canLink = () => window.self === window.top && window.isSecureContext && 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
  let handle = null;
  let mode = 'none'; // none | linked | needs (permission) | error
  let lastWrite = null;
  let errMsg = '';
  let queue = Promise.resolve();

  const idb = (access, fn) => new Promise((resolve, reject) => {
    const req = indexedDB.open('playgrounds-progress', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('handles', access);
      const q = fn(tx.objectStore('handles'));
      tx.oncomplete = () => { db.close(); resolve(q && q.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
  const getHandle = () => idb('readonly', s => s.get(KEY)).catch(() => null);
  const putHandle = h => idb('readwrite', s => s.put(h, KEY)).catch(() => {});
  const delHandle = () => idb('readwrite', s => s.delete(KEY)).catch(() => {});

  async function permission(h, ask) {
    if (!h.queryPermission) return 'granted';
    let p = await h.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted' && ask && h.requestPermission) p = await h.requestPermission({ mode: 'readwrite' });
    return p;
  }

  // Writes wait for the startup check, so a fresh default state can't overwrite a file that holds progress.
  let bootDone;
  const bootGate = new Promise(r => { bootDone = r; });

  async function writeNow() {
    await bootGate;
    if (!handle || mode !== 'linked') return;
    const snap = snapshot();
    if (!snap) return;
    try {
      const w = await handle.createWritable();
      await w.write(JSON.stringify(snap, null, 2));
      await w.close();
      lastWrite = new Date();
      errMsg = '';
    } catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) mode = 'needs';
      else { mode = 'error'; errMsg = e && e.name === 'NotFoundError' ? 'The save file was moved or deleted.' : 'Could not write the save file.'; }
    }
    render();
  }
  const scheduleWrite = () => { queue = queue.then(writeNow); };

  async function readHandle(h) {
    const text = await (await h.getFile()).text();
    return text.trim() === '' ? null : parseFile(text);
  }

  async function createLink() {
    try {
      const h = await showSaveFilePicker({ suggestedName: APP + '-progress.json', types: PICK_TYPES });
      handle = h; mode = 'linked';
      await putHandle(h);
      await writeNow();
      say(snapshot() ? 'Auto-saving to ' + h.name + '.' : 'Linked ' + h.name + '. It fills in after your next step.');
    } catch (e) { if (e && e.name !== 'AbortError') say('Could not create the file: ' + (e.message || e.name), true); }
  }

  async function openLink() {
    try {
      const [h] = await showOpenFilePicker({ types: PICK_TYPES });
      if ((await permission(h, true)) !== 'granted') return say('Permission to write to that file was denied.', true);
      const o = await readHandle(h);
      if (o && !confirmReplace()) return;
      await putHandle(h);
      if (o) return restore(o);
      handle = h; mode = 'linked';
      await writeNow();
      say('Auto-saving to ' + h.name + '.');
    } catch (e) { if (e && e.name !== 'AbortError') say(e.message || 'Could not open that file.', true); }
  }

  async function reconnect() {
    try {
      if ((await permission(handle, true)) !== 'granted') return say('Permission was denied.', true);
      mode = 'linked';
      if (!hasProgress()) {
        const o = await readHandle(handle);
        if (o && !pristine(o.data)) return restore(o);
      }
      await writeNow();
      say('Reconnected to ' + handle.name + '.');
    } catch (e) { mode = 'error'; errMsg = e.message || 'Could not reach the save file.'; render(); }
  }

  async function unlink() {
    await delHandle();
    handle = null; mode = 'none'; lastWrite = null;
    say('Stopped auto-saving. The file itself is untouched.');
  }

  /* ---------- keep browser storage from being evicted ---------- */
  let askedPersist = false;
  let persisted = null;
  async function refreshPersisted() {
    try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) { persisted = null; }
  }
  async function askPersist(force) {
    if (!navigator.storage || !navigator.storage.persist) return;
    try {
      if (!force) {
        if (askedPersist) return;
        askedPersist = true;
        if (await navigator.storage.persisted() || rawGet.call(ls, KEY + ':persist-asked')) return;
        rawSet.call(ls, KEY + ':persist-asked', '1');
      }
      persisted = await navigator.storage.persist();
      if (force) say(persisted ? 'Browser storage is now protected.' : 'The browser declined. Use Export to keep a copy.', !persisted);
    } catch (e) { /* storage may be locked down; nothing to do */ }
    render();
  }

  function afterSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(scheduleWrite, 400);
    askPersist(false);
  }

  /* ---------- UI ---------- */
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') n.className = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach(c => c != null && n.append(c));
    return n;
  };
  let trigger, panel, body, msgEl, fileInput, msgText = '', msgBad = false;

  function say(text, bad) {
    msgText = text; msgBad = !!bad;
    if (msgEl) { msgEl.textContent = text; msgEl.classList.toggle('pg-bad', !!bad); }
  }

  function render() {
    if (!body) return;
    trigger.classList.toggle('pg-alert', mode === 'needs' || mode === 'error');
    body.replaceChildren();

    body.append(el('div', { class: 'pg-sec' },
      el('h4', null, 'Copy to a file'),
      el('div', { class: 'pg-row' },
        el('button', { class: 'pg-btn', type: 'button', onclick: exportFile }, 'Export to file'),
        el('button', { class: 'pg-btn pg-ghost', type: 'button', onclick: () => fileInput.click() }, 'Import from file'))));

    const auto = el('div', { class: 'pg-sec' }, el('h4', null, 'Auto-save file'));
    if (!canLink()) {
      auto.append(el('p', { class: 'pg-note' }, 'Auto-saving to a file needs Chrome, Edge or Opera on the full page. Use Export instead.'));
    } else if (mode === 'none') {
      auto.append(
        el('p', { class: 'pg-note' }, 'Pick a file once and it is updated every time you progress. After clearing site data, open it again to get everything back.'),
        el('div', { class: 'pg-row' },
          el('button', { class: 'pg-btn', type: 'button', onclick: createLink }, 'Create save file…'),
          el('button', { class: 'pg-btn pg-ghost', type: 'button', onclick: openLink }, 'Open existing file…')));
    } else if (mode === 'linked') {
      auto.append(
        el('div', { class: 'pg-state pg-ok' }, el('span', null, 'Auto-saving to ', el('b', null, handle.name), lastWrite ? ' (last written ' + lastWrite.toLocaleTimeString() + ')' : '')),
        el('div', { class: 'pg-row' }, el('button', { class: 'pg-btn pg-ghost', type: 'button', onclick: unlink }, 'Stop auto-saving')));
    } else {
      auto.append(
        el('div', { class: 'pg-state pg-warn' }, el('span', null, mode === 'error' ? errMsg : 'The browser needs your OK to use ' + handle.name + ' again.')),
        el('div', { class: 'pg-row' },
          mode === 'needs' ? el('button', { class: 'pg-btn', type: 'button', onclick: reconnect }, 'Reconnect') : null,
          mode === 'error' ? el('button', { class: 'pg-btn', type: 'button', onclick: openLink }, 'Choose another file…') : null,
          el('button', { class: 'pg-btn pg-ghost', type: 'button', onclick: unlink }, 'Unlink')));
    }
    body.append(auto);

    if (persisted !== null) {
      body.append(el('div', { class: 'pg-sec' },
        el('h4', null, 'Browser storage'),
        el('div', { class: persisted ? 'pg-state pg-ok' : 'pg-state' }, el('span', null, persisted ? 'Protected: the browser will not clear it when disk space is low.' : 'Not protected: the browser may clear it when disk space is low.')),
        persisted ? null : el('div', { class: 'pg-row' }, el('button', { class: 'pg-btn pg-ghost', type: 'button', onclick: () => askPersist(true) }, 'Ask the browser to protect it'))));
    }
  }

  function placePanel() {
    panel.classList.remove('pg-left');
    if (trigger.getBoundingClientRect().right < panel.offsetWidth + 16) panel.classList.add('pg-left');
  }

  async function toggle(open) {
    open = open == null ? panel.hidden : open;
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) { await refreshPersisted(); render(); placePanel(); }
  }

  function mount() {
    const host = document.querySelector('header.top') || document.body;
    fileInput = el('input', { class: 'pg-file', type: 'file', accept: '.json,application/json', tabindex: '-1', 'aria-hidden': 'true' });
    fileInput.addEventListener('change', () => importFromInput(fileInput));
    trigger = el('button', { class: 'pg-trigger', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'pg-panel', onclick: () => toggle() }, 'Progress');
    msgEl = el('p', { class: 'pg-msg', role: 'status', 'aria-live': 'polite' });
    body = el('div', { class: 'pg-body' });
    panel = el('div', { class: 'pg-panel', id: 'pg-panel', role: 'region', 'aria-label': 'Save and restore progress', hidden: '' },
      el('h3', null, 'Your progress'),
      el('p', { class: 'pg-note' }, 'It is saved in this browser. Clearing site data erases it, so keep a copy in a file.'),
      body, msgEl, fileInput);
    host.append(el('div', { class: 'pg-wrap' }, trigger, panel));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); trigger.focus(); } });
    document.addEventListener('click', e => { if (!panel.hidden && !e.target.closest('.pg-wrap')) toggle(false); });
    window.addEventListener('resize', () => { if (!panel.hidden) placePanel(); });
    render();
  }

  /* ---------- start up ---------- */
  async function boot() {
    mount();
    try { await startup(); } finally { bootDone(); }
    render();
  }

  async function startup() {
    if (!canLink()) return;
    const h = await getHandle();
    if (!h) return;
    handle = h;
    let p = 'prompt';
    try { p = await permission(h, false); } catch (e) { /* fall through to reconnect */ }
    if (p === 'granted') {
      mode = 'linked';
      if (!hasProgress()) {
        try { const o = await readHandle(h); if (o && !pristine(o.data)) return restore(o); } catch (e) { /* unreadable file: keep going */ }
      }
    } else {
      mode = 'needs';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
