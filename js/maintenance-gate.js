/* Kizimin maintenance gate
 * The site uses its existing Supabase maintenance-state RPC.
 * No IP address is collected or used.
 */
(() => {
  "use strict";
  const URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  const GATE = "kizimin-maintenance-gate";
  const client = window.supabase?.createClient(URL, KEY);
  if (!client) return;

  function render() {
    if (document.getElementById(GATE) || !document.body) return;
    const overlay = document.createElement("div");
    overlay.id = GATE;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "kizimin-maintenance-title");
    overlay.setAttribute("aria-live", "polite");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#fff;color:#111;font-family:inherit;text-align:center;overflow:auto";
    overlay.innerHTML = '<main style="width:min(100%,560px);margin:auto"><h1 id="kizimin-maintenance-title" style="margin:0 0 18px;font-size:clamp(24px,5vw,32px);font-weight:700;line-height:1.5">現在メンテナンス中です</h1><p style="margin:0;font-size:15px;line-height:2;color:#333">Kiziminはメンテナンス中のため、現在記事の閲覧・投稿などの機能をご利用いただけません。</p><p style="margin:18px 0 0;font-size:13px;line-height:1.8;color:#666">メンテナンス終了までしばらくお待ちください。</p></main>';
    document.body.appendChild(overlay);
    Array.from(document.body.children).forEach((element) => {
      if (element !== overlay) element.setAttribute("inert", "");
    });
    document.documentElement.style.overflow = "hidden";
  }

  async function check() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      let result;
      try {
        result = await client.rpc("get_site_maintenance_state", {}, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!result.error && result.data === true) render();
    } catch (error) {
      // If Supabase is unreachable, do not falsely claim maintenance is enabled.
      console.warn("メンテナンス状態を確認できませんでした。", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", check, { once: true });
  else check();
})();
