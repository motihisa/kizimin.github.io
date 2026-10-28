(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const OWNER_ID = "9589135e-4f75-4913-b13f-35407eeedf3b";
  const URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  let busy = false;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  function ensureToolbar() {
    const body = $("users-body");
    const view = $("view-users");
    const wrap = view?.querySelector(".admin-table-wrap");
    if (!body || !wrap) return;
    if (!$("bulk-user-toolbar")) {
      const bar = document.createElement("section");
      bar.id = "bulk-user-toolbar";
      bar.className = "admin-panel";
      bar.style.cssText = "margin:12px 0;padding:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap";
      bar.innerHTML = '<strong>ユーザー一括管理</strong><span id="bulk-user-count" aria-live="polite">0人選択中</span><button type="button" class="admin-btn" id="bulk-user-select-visible">表示中を全選択</button><button type="button" class="admin-btn" id="bulk-user-clear">選択解除</button><label>操作<select id="bulk-user-action"><option value="active">利用制限を解除</option><option value="suspended">一時停止</option><option value="banned">BAN</option></select></label><label id="bulk-user-expiry-wrap" style="display:none">BAN解除日時（日本時間）<input id="bulk-user-expiry" type="datetime-local" step="60"></label><button type="button" class="admin-btn primary" id="bulk-user-apply" disabled>選択したユーザーに適用</button><span id="bulk-user-status" role="status"></span>';
      wrap.parentNode.insertBefore(bar, wrap);
      $("bulk-user-select-visible").onclick = () => {
        body.querySelectorAll("tr:not([hidden]) .bulk-user-check:not(:disabled)").forEach(c => c.checked = true);
        updateCount();
      };
      $("bulk-user-clear").onclick = () => { body.querySelectorAll(".bulk-user-check").forEach(c => c.checked = false); updateCount(); };
      $("bulk-user-action").onchange = () => { $("bulk-user-expiry-wrap").style.display = $("bulk-user-action").value === "banned" ? "grid" : "none"; };
      $("bulk-user-apply").onclick = apply;
    }
    body.querySelectorAll("tr").forEach(row => {
      if (!row.querySelector(".account-status")) return;
      const select = row.querySelector(".account-status");
      const first = row.cells?.[0];
      if (!first || first.querySelector(".bulk-user-check")) return;
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "bulk-user-check";
      check.dataset.id = select.dataset.id || "";
      check.disabled = select.disabled || !check.dataset.id || check.dataset.id === OWNER_ID;
      check.setAttribute("aria-label", "このユーザーを一括管理対象に選択");
      check.style.marginRight = "8px";
      check.addEventListener("change", updateCount);
      first.prepend(check);
    });
    updateCount();
  }
  function updateCount() {
    const count = document.querySelectorAll("#users-body .bulk-user-check:checked").length;
    if ($("bulk-user-count") && $("bulk-user-count").textContent !== count + "人選択中") $("bulk-user-count").textContent = count + "人選択中";
    if ($("bulk-user-apply")) $("bulk-user-apply").disabled = busy || count === 0;
  }
  function toIsoJst(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4]-9, +m[5], +(m[6] || 0))).toISOString();
  }
  async function apply() {
    if (busy) return;
    const checks = [...document.querySelectorAll("#users-body .bulk-user-check:checked")];
    const selected = checks.map(c => ({id:c.dataset.id,row:c.closest("tr"),name:c.closest("tr")?.cells?.[1]?.textContent?.trim() || c.closest("tr")?.cells?.[0]?.textContent?.trim() || c.dataset.id})).filter(x => x.id && x.id !== OWNER_ID && x.row?.querySelector(".account-status") && !x.row.querySelector(".account-status").disabled);
    if (!selected.length) { alert("変更できるユーザーを選択してください。"); return; }
    const action = $("bulk-user-action").value;
    const reason = action === "active" ? null : prompt("選択した" + selected.length + "人に適用する制限理由を入力してください。");
    if (action !== "active" && (reason === null || !reason.trim())) { if (reason !== null) alert("理由が空のため中止しました。"); return; }
    let expiresAt = null;
    if (action === "banned" && $("bulk-user-expiry").value) {
      expiresAt = toIsoJst($("bulk-user-expiry").value);
      if (!expiresAt || Date.parse(expiresAt) <= Date.now()) { alert("BAN解除日時は現在より後の日時にしてください。"); return; }
    }
    const names = selected.slice(0,6).map(x => x.name).join("、") + (selected.length > 6 ? " ほか" : "");
    const labels = {active:"利用制限解除",suspended:"一時停止",banned:"BAN"};
    if (!confirm(selected.length + "人のアカウントを一括変更します。\n操作: " + labels[action] + "\n対象: " + names + (action !== "active" ? "\n理由: " + reason.trim() : "") + "\n\n実行しますか？")) return;
    const client = window.supabase?.createClient?.(URL, KEY);
    if (!client) { alert("Supabaseに接続できません。"); return; }
    busy = true;
    $("bulk-user-apply").disabled = true;
    let succeeded = 0;
    const failures = [];
    try {
      for (let i = 0; i < selected.length; i++) {
        const u = selected[i];
        const {error} = await client.rpc("admin_set_account_status", {
          p_target_id:u.id, p_status:action, p_reason:reason?.trim() || null,
          p_expires_at:action === "banned" ? expiresAt : null
        });
        if (error) failures.push(u.name + ": " + (error.message || "更新失敗"));
        else succeeded++;
        $("bulk-user-status").textContent = "処理中 " + (i+1) + "/" + selected.length + " · 成功 " + succeeded + " · 失敗 " + failures.length;
      }
      $("bulk-user-status").textContent = "完了 · 成功 " + succeeded + "人 / 失敗 " + failures.length + "人";
      alert("一括管理が完了しました。\n成功: " + succeeded + "人\n失敗: " + failures.length + "人" + (failures.length ? "\n\n" + failures.slice(0,5).join("\n") : ""));
      if (succeeded) {
        const usersTab = document.querySelector('[data-view="users"]');
        usersTab?.click();
      }
    } catch (e) {
      console.error("[Kizimin] bulk user moderation failed", e);
      $("bulk-user-status").textContent = "途中でエラー。成功済みの変更がある可能性があります。";
      alert("処理が途中で止まりました。一部の変更は反映済みの可能性があります。ユーザー一覧を再読み込みして状態を確認してください。");
    } finally {
      busy = false;
      updateCount();
    }
  }
  const observer = new MutationObserver(() => ensureToolbar());
  observer.observe(document.documentElement, {childList:true,subtree:true});
  document.addEventListener("DOMContentLoaded", ensureToolbar);
  setTimeout(ensureToolbar, 0);
})();