(() => {
  "use strict";
  const URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  function render(article, text) {
    const nav = article.querySelector(".legal-nav");
    const content = document.createElement("div");
    content.className = "legal-custom-content";
    const blocks = String(text).trim().split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    for (const block of blocks) {
      const line = block.replace(/^\s+|\s+$/g, "");
      let el, value = line;
      if (line.startsWith("# ")) { el = document.createElement("h1"); value = line.slice(2); }
      else if (line.startsWith("## ")) { el = document.createElement("h2"); value = line.slice(3); }
      else if (line.startsWith("### ")) { el = document.createElement("h3"); value = line.slice(4); }
      else { el = document.createElement("p"); }
      el.textContent = value;
      if (el.tagName === "P") el.style.whiteSpace = "pre-line";
      content.appendChild(el);
    }
    article.replaceChildren(content);
    if (nav) article.appendChild(nav);
  }
  async function run() {
    const article = document.querySelector(".legal-card[data-legal-key]");
    if (!article || !window.supabase?.createClient) return;
    try {
      const db = window.supabase.createClient(URL, KEY);
      const { data, error } = await db.from("site_editor_settings").select("setting_value").eq("setting_key", "site_theme").maybeSingle();
      if (error) throw error;
      const key = article.dataset.legalKey;
      const custom = String(data?.setting_value?.[key] || "").trim();
      if (custom) render(article, custom);
    } catch (error) {
      console.warn("編集済みの規約文章を読み込めませんでした。既定の文章を表示します。", error);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
})();
