/* "How it works" steps for a mission card. HowSteps.html(how) -> '' or an ordered list.
   how: array of HTML strings (same trust as a mission's explain). Step 1 says what the whole
   command does; the next steps tie each part back to it. HowSteps.tick(s, esc) is for text a page
   escapes: each pair of backticks becomes <code>. Pure: no DOM, loads in Node. */
(function (root) {
  function html(how) {
    if (!Array.isArray(how) || !how.length) return '';
    return `<div class="how"><div class="label">How it works</div><ol>${how.map((s) => `<li>${s}</li>`).join('')}</ol></div>`;
  }
  /* Text a page escapes (esc) can still show code: tick(s, esc) turns each pair of backticks into <code>. */
  function tick(s, esc) {
    return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  }
  root.HowSteps = { html, tick };
})(typeof window !== 'undefined' ? window : globalThis);
