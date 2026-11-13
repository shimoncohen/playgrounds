/* Trail.html takes authored HTML-safe story text; settings.js owns the Story setting and data-story, which trail.css reads. */
window.Trail = {
  html: story => story ? `<p class="trail"><span class="trail-tag">The trail</span>${story}</p>` : '',
};
