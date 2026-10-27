/* Public homepage themes. Saved locally in this browser; no account data is changed. */
(() => {
  "use strict";
  const KEY = "kizimin-public-theme";
  const allowed = new Set(["violet", "light", "dark", "ocean", "sakura"]);
  const apply = value => {
    const theme = allowed.has(value) ? value : "violet";
    document.body.dataset.siteTheme = theme;
    try { localStorage.setItem(KEY, theme); } catch (_) {}
    const select = document.getElementById("site-theme-select");
    if (select && select.value !== theme) select.value = theme;
  };
  const mount = () => {
    let saved = "violet";
    try { const value = localStorage.getItem(KEY); if (allowed.has(value)) saved = value; } catch (_) {}
    const select = document.getElementById("site-theme-select");
    if (select) select.addEventListener("change", () => apply(select.value));
    apply(saved);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, {once:true});
  else mount();
})();