/* Public homepage themes. Saved locally in this browser; no account data is changed. */
(() => {
  "use strict";
  const KEY = "kizimin-public-theme";
  const THEMES = ["violet", "light", "dark", "ocean", "sakura"];
  const selectId = "site-theme-select";

  function normalize(value) {
    return THEMES.includes(value) ? value : "violet";
  }

  function applyTheme(value, persist = true) {
    const theme = normalize(value);
    document.body.dataset.siteTheme = theme;
    document.documentElement.dataset.siteTheme = theme;
    const select = document.getElementById(selectId);
    if (select && select.value !== theme) select.value = theme;
    if (persist) {
      try { localStorage.setItem(KEY, theme); } catch (error) {
        // Theme still works for this page even if storage is unavailable.
      }
    }
  }

  function mount() {
    const select = document.getElementById(selectId);
    let saved = "violet";
    try { saved = normalize(localStorage.getItem(KEY)); } catch (error) {}

    if (select) {
      select.value = saved;
      // Replace any previous handler so mounting cannot register duplicates.
      select.onchange = () => applyTheme(select.value, true);
      select.addEventListener("input", () => applyTheme(select.value, true));
    }
    applyTheme(saved, false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();