/* Admin theme selector: presentation only. No database or auth changes. */
(() => {
  const KEY = "kizimin-admin-theme";
  const allowed = new Set(["xp", "win7", "future"]);
  let theme = "xp";
  try {
    const saved = localStorage.getItem(KEY);
    if (allowed.has(saved)) theme = saved;
  } catch (_) {}
  const apply = (value) => {
    theme = allowed.has(value) ? value : "xp";
    document.body.dataset.adminTheme = theme;
    try { localStorage.setItem(KEY, theme); } catch (_) {}
    const picker = document.getElementById("admin-theme-select");
    if (picker && picker.value !== theme) picker.value = theme;
  };
  const mount = () => {
    const host = document.querySelector(".admin-top-actions") || document.querySelector(".email-checker-head");
    if (!host || document.getElementById("admin-theme-select")) { apply(theme); return; }
    const wrap = document.createElement("label");
    wrap.className = "admin-theme-picker";
    wrap.innerHTML = '<span>テーマ</span><select id="admin-theme-select" aria-label="管理画面のテーマ"><option value="xp">Windows XP</option><option value="win7">Windows 7</option><option value="future">近未来ネオン</option></select>';
    host.appendChild(wrap);
    const select = wrap.querySelector("select");
    select.addEventListener("change", () => apply(select.value));
    apply(theme);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();