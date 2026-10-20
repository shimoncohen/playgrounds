/* "How it works" steps for a mission card. HowSteps.html(how) -> '' or an ordered list.
   how: array of HTML strings (same trust as a mission's explain). Step 1 says what the whole
   command does; the next steps tie each part back to it. Pure: no DOM, loads in Node. */
(function (root) {
  function html(how) {
    if (!Array.isArray(how) || !how.length) return '';
    return `<div class="how"><div class="label">How it works</div><ol>${how.map((s) => `<li>${s}</li>`).join('')}</ol></div>`;
  }
  root.HowSteps = { html };
})(typeof window !== 'undefined' ? window : globalThis);
