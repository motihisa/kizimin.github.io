(() => {
  "use strict";
  const URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  const $ = id => document.getElementById(id);
  const db = window.supabase.createClient(URL, KEY);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function deny(message) {
    $("email-checker-loading").classList.add("hidden");
    $("email-checker-app").classList.add("hidden");
    $("email-checker-denied").classList.remove("hidden");
    $("email-checker-denied-message").textContent = message;
  }
  async function init() {
    try {
      const {data:{session},error} = await db.auth.getSession();
      if (error || !session?.user?.id) { location.href = "login.html"; return; }
      const {data:owner,error:ownerError} = await db.rpc("is_site_owner");
      if (ownerError || owner !== true) { deny("この機能を利用できるのはサイトオーナーのみです。"); return; }
      $("email-checker-loading").classList.add("hidden");
      $("email-checker-app").classList.remove("hidden");
    } catch {
      deny("ログイン状態またはオーナー権限を確認できませんでした。");
    }
  }
  function item(label, value, tone) {
    return '<div class="email-check-result"><span>'+esc(label)+'</span><strong class="'+esc(tone||"")+'">'+esc(value)+'</strong></div>';
  }
  $("email-checker-form").addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("email-checker-input").value.trim();
    const button = $("email-checker-submit");
    const errorBox = $("email-checker-error");
    const resultBox = $("email-checker-result");
    errorBox.classList.add("hidden");
    resultBox.classList.add("hidden");
    button.disabled = true;
    button.textContent = "確認中...";
    try {
      const {data,error} = await db.functions.invoke("owner-email-checker", {body:{email}});
      if (error) throw error;
      if (data?.error) {
        const messages = {OWNER_ONLY:"オーナー権限がありません。",OWNER_CHECK_FAILED:"オーナー権限の確認に失敗しました。",AUTH_REQUIRED:"ログインしてください。",INVALID_SESSION:"セッションが切れています。再ログインしてください。",INVALID_EMAIL:"メールアドレスの形式を確認してください。",CHECK_FAILED:"チェックに失敗しました。時間をおいて再試行してください。"};
        throw new Error(messages[data.error] || "判定に失敗しました。");
      }
      const r = data.result;
      if (!r) throw new Error("判定結果を取得できませんでした。");
      const yesNo = value => value === true ? "確認できました" : value === false ? "確認できません" : "判定不能";
      const mxLabel = r.mx_found === true ? "MXレコードあり" : r.mx_found === false ? "MXレコードなし／確認できず" : "判定不能";
      const domainLabel = r.domain_resolves === true ? "DNSで確認できました" : r.domain_resolves === false ? "ドメインが見つかりません" : "判定不能";
      const disposable = r.disposable === "yes" ? ["使い捨ての可能性が高い","bad"] : r.disposable === "no" ? ["リスト上では検出なし","good"] : ["判定不能","warn"];
      resultBox.innerHTML = '<h2>判定結果</h2><p class="email-checker-domain">'+esc(r.domain || "")+'</p>' +
        item("メール形式", r.format_valid ? "形式は有効" : "形式が無効", r.format_valid ? "good" : "bad") +
        item("MXレコード", yesNo(r.mx_found), r.mx_found === true ? "good" : r.mx_found === false ? "warn" : "warn") +
        item("ドメイン解決", yesNo(r.domain_resolves), r.domain_resolves === true ? "good" : r.domain_resolves === false ? "bad" : "warn") +
        item("使い捨てメール", disposable[0], disposable[1]) +
        item("ロール系アドレス", r.role_based ? "該当の可能性あり" : "該当パターンなし", r.role_based ? "warn" : "") +
        '<p class="email-checker-note">'+esc(r.note || "")+'</p>';
      resultBox.classList.remove("hidden");
    } catch (error) {
      errorBox.textContent = error?.message || "チェックに失敗しました。";
      errorBox.classList.remove("hidden");
    } finally {
      button.disabled = false;
      button.textContent = "チェックする";
    }
  });
  init();
})();