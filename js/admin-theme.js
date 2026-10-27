/* Admin console themes only. */
(() => {
  "use strict";
  const KEY = "kizimin-admin-theme";
  const THEMES = ["xp", "win7", "future", "violet", "light", "dark", "ocean", "sakura"];
  const normalize = value => THEMES.includes(value) ? value : "xp";
  function mount() {
    const select = document.getElementById("admin-theme-select");
    let theme = "xp";
    try { theme = normalize(localStorage.getItem(KEY)); } catch (_) {}
    const apply = value => {
      theme = normalize(value);
      document.body.dataset.adminTheme = theme;
      document.body.dataset.siteTheme = theme;
      document.documentElement.dataset.siteTheme = theme;
      if (select) select.value = theme;
      try { localStorage.setItem(KEY, theme); } catch (_) {}
    };
    if (select) {
      select.value = theme;
      select.addEventListener("change", () => apply(select.value));
    }
    apply(theme);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
