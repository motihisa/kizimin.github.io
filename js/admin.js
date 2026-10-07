(() => {
  "use strict";
  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const $ = (id) => document.getElementById(id);

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
  const date = v => v ? new Date(v).toLocaleString("ja-JP") : "-";

  function forbidden(message) {
    $("admin-loading").classList.add("hidden");
    $("admin-app").classList.add("hidden");
    $("admin-forbidden").classList.remove("hidden");
    $("admin-forbidden-reason").textContent = message;
  }

  async function checkAdmin() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) { location.href = "login.html"; return false; }

    const { data, error } = await supabase.rpc("admin_access_check");
    if (error) { console.error(error); forbidden("Supabase側の管理者チェックに失敗しました。"); return false; }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result || result.allowed !== true || result.role !== "admin") {
      forbidden("現在のSupabaseプロフィールにadmin権限がありません。");
      return false;
    }

    $("admin-loading").classList.add("hidden");
    $("admin-app").classList.remove("hidden");
    renderAudit(result.recent_role_changes || []);
    return true;
  }

  function renderAudit(changes) {
    $("role-audit-summary").innerHTML = changes.length
      ? '<div class="admin-alert"><strong>過去24時間に権限変更があります。</strong><div class="admin-log">' +
        changes.map(x => esc(date(x.changed_at) + " / 対象: " + x.target_user_id + " / 変更者: " + (x.changed_by || "不明") + " / " + x.old_role + " → " + x.new_role)).join("\n") +
        "</div></div>"
      : '<div class="admin-ok">過去24時間に権限変更はありません。</div>';
  }

  async function loadUsers() {
    const { data, error } = await supabase.from("profiles")
      .select("id,username,display_name,role,created_at").order("created_at", { ascending:false });
    if (error) throw error;
    $("users-body").innerHTML = data.length ? data.map(u => `
      <tr><td>${esc(u.username || u.id)}</td><td>${esc(u.display_name || "-")}</td><td><span class="admin-badge">${esc(u.role)}</span></td><td>${esc(date(u.created_at))}</td>
      <td><button type="button" class="user-role" data-id="${esc(u.id)}" data-role="${esc(u.role)}">${u.role === "admin" ? "userに変更" : "adminに変更"}</button></td></tr>`).join("") : '<tr><td colspan="5">ユーザーはいません。</td></tr>';
    document.querySelectorAll(".user-role").forEach(b => b.onclick = () => changeRole(b.dataset.id,b.dataset.role));
  }

  async function changeRole(id, current) {
    const next = current === "admin" ? "user" : "admin";
    if (!confirm("このユーザーを " + next + " に変更しますか？")) return;
    const { error } = await supabase.from("profiles").update({ role:next }).eq("id",id);
    if (error) { alert("権限変更に失敗しました: " + error.message); return; }
    await loadUsers();
    const { data } = await supabase.rpc("admin_access_check");
    renderAudit((Array.isArray(data) ? data[0] : data)?.recent_role_changes || []);
  }

  async function loadArticles() {
    const { data, error } = await supabase.from("articles")
      .select("id,title,status,created_at,profiles(username,display_name)").order("created_at",{ascending:false});
    if (error) throw error;
    $("articles-body").innerHTML = data.length ? data.map(a => `
      <tr><td>${esc(a.title)}</td><td>${esc(a.profiles?.display_name || a.profiles?.username || "-")}</td><td><span class="admin-badge">${esc(a.status)}</span></td><td>${esc(date(a.created_at))}</td>
      <td><select class="article-status" data-id="${esc(a.id)}">${["draft","published","archived"].map(s => `<option value="${s}" ${s===a.status?"selected":""}>${s}</option>`).join("")}</select></td></tr>`).join("") : '<tr><td colspan="5">記事はありません。</td></tr>';
    document.querySelectorAll(".article-status").forEach(s => s.onchange = () => updateArticle(s.dataset.id,s.value));
  }
  async function updateArticle(id,status) {
    const { error } = await supabase.from("articles").update({status}).eq("id",id);
    if (error) { alert("記事状態の変更に失敗しました: " + error.message); await loadArticles(); }
  }

  async function loadComments() {
    const { data, error } = await supabase.from("comments")
      .select("id,content,status,created_at,profiles(username,display_name)").order("created_at",{ascending:false});
    if (error) throw error;
    $("comments-body").innerHTML = data.length ? data.map(c => `
      <tr><td class="admin-log">${esc(c.content)}</td><td>${esc(c.profiles?.display_name || c.profiles?.username || "-")}</td><td><span class="admin-badge">${esc(c.status)}</span></td><td>${esc(date(c.created_at))}</td>
      <td><select class="comment-status" data-id="${esc(c.id)}">${["visible","hidden","deleted"].map(s => `<option value="${s}" ${s===c.status?"selected":""}>${s}</option>`).join("")}</select></td></tr>`).join("") : '<tr><td colspan="5">コメントはありません。</td></tr>';
    document.querySelectorAll(".comment-status").forEach(s => s.onchange = () => updateComment(s.dataset.id,s.value));
  }
  async function updateComment(id,status) {
    const { error } = await supabase.from("comments").update({status}).eq("id",id);
    if (error) { alert("コメント状態の変更に失敗しました: " + error.message); await loadComments(); }
  }

  async function loadReports() {
    const { data, error } = await supabase.from("reports")
      .select("id,article_id,comment_id,reason,status,admin_note,created_at").order("created_at",{ascending:false});
    if (error) throw error;
    $("reports-body").innerHTML = data.length ? data.map(r => `
      <tr><td>${esc(r.article_id ? "記事: " + r.article_id : "コメント: " + r.comment_id)}</td><td class="admin-log">${esc(r.reason)}</td><td><span class="admin-badge">${esc(r.status)}</span></td><td>${esc(date(r.created_at))}</td>
      <td><select class="report-status" data-id="${esc(r.id)}">${["open","reviewing","resolved","dismissed"].map(s => `<option value="${s}" ${s===r.status?"selected":""}>${s}</option>`).join("")}</select><br>
      <textarea class="report-note" data-id="${esc(r.id)}" placeholder="管理者メモ">${esc(r.admin_note || "")}</textarea><br><button type="button" class="report-save" data-id="${esc(r.id)}">保存</button></td></tr>`).join("") : '<tr><td colspan="5">通報はありません。</td></tr>';
    document.querySelectorAll(".report-save").forEach(b => b.onclick = () => saveReport(b.dataset.id));
  }
  async function saveReport(id) {
    const status = document.querySelector('.report-status[data-id="' + CSS.escape(id) + '"]').value;
    const note = document.querySelector('.report-note[data-id="' + CSS.escape(id) + '"]').value;
    const { error } = await supabase.from("reports").update({
      status, admin_note:note,
      resolved_at: status === "resolved" || status === "dismissed" ? new Date().toISOString() : null
    }).eq("id",id);
    if (error) { alert("通報の更新に失敗しました: " + error.message); return; }
    await loadReports();
  }

  async function init() {
    if (!(await checkAdmin())) return;
    try {
      await Promise.all([loadUsers(),loadArticles(),loadComments(),loadReports()]);
    } catch (e) {
      console.error(e);
      alert("管理データの読み込みに失敗しました: " + e.message);
    }
  }
  init();
})();