/* Kizimin maintenance gate
 * Maintenance state is enforced by Supabase RLS as well as this UI gate.
 * No IP address is collected or used.
 */
(() => {
  "use strict";
  const URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  const GATE = "kizimin-maintenance-gate";
  const client = window.supabase?.createClient(URL, KEY);
  if (!client) return;

  async function check() {
    try {
      const { data, error } = await client.rpc("get_site_maintenance_state");
      if (error || data !== true) return;
      render();
    } catch (_) {}
  }

  function render() {
    if (document.getElementById(GATE) || !document.body) return;
    const overlay=document.createElement("div");
    overlay.id=GATE;
    overlay.style.cssText="position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;background:#f5f7fb;color:#111827;font-family:inherit";
    overlay.innerHTML='<div style="width:min(100%,520px);padding:36px 30px;background:#fff;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 16px 50px rgba(15,23,42,.10);text-align:center"><div style="font-size:11px;font-weight:800;letter-spacing:.16em;color:#6b7280;margin-bottom:10px">MAINTENANCE</div><h1 style="margin:0 0 12px;font-size:28px">現在メンテナンス中です</h1><p style="margin:0;color:#667085;line-height:1.8">サイトは現在メンテナンス中のため、管理者以外は閲覧・投稿などの操作を利用できません。</p><p style="margin:18px 0 0;font-size:12px;color:#98a2b3">メンテナンスが終了するまでしばらくお待ちください。</p></div>';
    document.body.appendChild(overlay);
    Array.from(document.body.children).forEach(x=>{if(x!==overlay)x.setAttribute("inert","");});
    document.documentElement.style.overflow="hidden";
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",check);
  else check();
})();
