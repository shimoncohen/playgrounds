(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};
  const PREFS = 'math-prefs-v1';
  let uid = 0;
  // Resolved from this file, not the page, so track pages and the test page find the same vendor folder.
  const HERE = document.currentScript ? document.currentScript.src : location.href;
  const VENDOR = new URL('../vendor/', HERE).href;
  const KEYS = [['a/b', '/', 'fraction'], ['√', 'sqrt(', 'square root'], ['^', '^', 'power'], ['π', 'pi', 'pi'], ['(', '(', 'open bracket'], [')', ')', 'close bracket']];

  const h = (tag, cls, parent, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  const esc = s => s.replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
  const codeHtml = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  const tex = s => MQ.check.tex(s);
  const katexInto = (el, s) => {
    el.replaceChildren();
    if (!window.katex || !String(s).trim()) return;
    try { katex.render(tex(s), el, { throwOnError: false }); } catch (e) { /* half-typed step: no preview yet */ }
  };

  const prefs = () => { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch (e) { return {}; } };
  const savePrefs = p => { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch (e) { /* storage blocked: keep the choice for this visit */ } };

  let mathlive;
  const loadMathLive = () => mathlive || (mathlive = new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = VENDOR + 'mathlive/mathlive.min.js';
    s.onload = () => {
      const M = window.MathLive.MathfieldElement;
      M.fontsDirectory = VENDOR + 'katex/fonts/';
      M.soundsDirectory = null;
      const kb = window.mathVirtualKeyboard;
      if (kb) kb.addEventListener('geometrychange', () => document.body.classList.toggle('mq-kbd', kb.visible));
      ok();
    };
    s.onerror = () => { mathlive = null; fail(new Error('MathLive did not load')); };
    document.head.appendChild(s);
  }));

  MQ.work = {};
  MQ.work.mount = (el, mission, { saved, onPass } = {}) => {
    const kind = mission.kind || 'number';
    let mode = prefs().input === 'text' ? 'text' : 'visual';
    let last = null, passed = false;
    el.classList.add('mq-work');
    el.replaceChildren();
    const top = h('div', 'mq-work-top', el);
    const q = h('div', 'mq-q', top);
    q.setAttribute('aria-label', 'Question: ' + mission.question);
    // A mission's own tex keeps ÷ as ÷: math.js would print 12/2*3 as a fraction, hiding the left-to-right order.
    if (mission.tex && window.katex) katex.render(mission.tex, q, { throwOnError: false });
    else katexInto(q, mission.question);
    if (!q.childNodes.length) q.textContent = mission.question;
    const sw = h('label', 'mq-switch', top);
    const box = h('input', null, sw);
    box.type = 'checkbox';
    box.setAttribute('role', 'switch');
    h('span', null, sw, 'Math keyboard');
    const list = h('ol', 'mq-steps', el);
    list.setAttribute('aria-label', 'Your working, one step per line');
    const pad = h('div', 'mq-keypad', el);
    pad.setAttribute('aria-label', 'Symbols');
    for (const [label, ins, name] of KEYS) {
      const b = h('button', 'btn', pad, label);
      b.type = 'button';
      b.setAttribute('aria-label', name);
      b.addEventListener('pointerdown', e => e.preventDefault());
      b.addEventListener('click', () => {
        const f = last && last.isConnected ? last : fields().at(-1);
        const at = f.selectionStart ?? f.value.length, end = f.selectionEnd ?? at;
        f.value = f.value.slice(0, at) + ins + f.value.slice(end);
        f.focus();
        f.setSelectionRange(at + ins.length, at + ins.length);
        f.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    const result = h('p', 'mq-result', el);
    result.setAttribute('aria-live', 'polite');

    const fields = () => [...list.querySelectorAll('.mq-field')];
    const read = f => f.tagName === 'MATH-FIELD' ? MQ.check.translate(f.getValue('ascii-math')) : f.value;
    const values = () => fields().map(read);

    const check = () => {
      const lis = [...list.children], vals = values();
      const filled = vals.map((v, i) => [v.trim(), i]).filter(([v]) => v);
      const res = MQ.check.steps(mission.question, filled.map(([v]) => v), { kind, vars: mission.vars });
      lis.forEach(li => { li.querySelector('.mq-mark').textContent = ''; li.querySelector('.mq-why').replaceChildren(); li.classList.remove('ok', 'bad'); });
      filled.forEach(([, i], k) => {
        const li = lis[i], r = res[k], mark = li.querySelector('.mq-mark');
        li.classList.add(r.ok ? 'ok' : 'bad');
        mark.textContent = r.ok ? '✓' : '✗';
        mark.setAttribute('aria-label', r.ok ? 'step is right' : 'step is not right yet');
        if (!r.ok) li.querySelector('.mq-why').innerHTML = codeHtml(r.why || '');
      });
      const steps = filled.map(([v]) => v);
      const final = steps.length ? mission.check(steps.at(-1)) : { ok: false };
      const all = res.every(r => r.ok) && steps.length > 0;
      const ok = final.ok && (mission.work !== 'required' || all);
      result.textContent = ok ? 'That solves it.' : final.ok ? 'The answer is right. Now make every step show ✓.' : '';
      if (ok && !passed && onPass) onPass(steps);
      passed = ok;
    };

    const addStep = (value = '', after = null) => {
      const li = h('li', 'mq-step');
      if (kind !== 'equation') h('span', 'mq-eq', li, '=').setAttribute('aria-hidden', 'true');
      let f;
      if (mode === 'visual') {
        f = h('math-field', 'mq-field', li);
        if (value) f.setValue(tex(value));
      } else {
        f = h('input', 'mq-field', li);
        f.type = 'text';
        f.autocomplete = 'off';
        f.spellcheck = false;
        f.setAttribute('autocapitalize', 'off');
        f.value = value;
      }
      h('span', 'mq-mark', li).setAttribute('role', 'img');
      const prev = mode === 'text' ? h('div', 'mq-prev', li) : null;
      h('div', 'mq-why', li);
      if (prev) { katexInto(prev, value); f.addEventListener('input', () => katexInto(prev, f.value)); }
      f.addEventListener('focus', () => { last = f; });
      f.addEventListener('change', check);
      f.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          check();
          addStep('', li).focus();
        } else if (e.key === 'Backspace' && !read(f) && list.children.length > 1) {
          e.preventDefault();
          const up = li.previousElementSibling || li.nextElementSibling;
          li.remove();
          up.querySelector('.mq-field').focus();
          check();
        }
      });
      if (after) after.after(li); else list.appendChild(li);
      label();
      return f;
    };
    const label = () => fields().forEach((f, i) => f.setAttribute('aria-label', 'Step ' + (i + 1)));

    const build = async (vals, next) => {
      if (next === 'visual') {
        try { await loadMathLive(); } catch (e) { next = 'text'; }
      }
      mode = next;
      box.checked = mode === 'visual';
      el.dataset.mode = mode;
      pad.hidden = mode !== 'text';
      list.replaceChildren();
      (vals.length ? vals : ['']).forEach(v => addStep(v));
      check();
    };
    box.addEventListener('change', () => {
      const next = box.checked ? 'visual' : 'text';
      savePrefs(Object.assign(prefs(), { input: next }));
      build(values(), next);
    });

    const ready = build(Array.isArray(saved) ? saved : [], mode);
    return { ready, values, mode: () => mode, check };
  };

  MQ.work.notes = (el, text, onSave) => {
    const id = 'mqn' + ++uid;
    const lab = h('label', 'mq-notes-lab', el, 'Your notes for this chapter');
    lab.htmlFor = id;
    const t = h('textarea', 'mq-notes', el);
    t.id = id;
    t.rows = 4;
    t.value = text || '';
    let timer = 0;
    t.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => onSave(t.value), 300); });
    return t;
  };
})();
