(() => {
  "use strict";
  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const $ = (id) => document.getElementById(id);

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
  const JST_OPTIONS = { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };\n  const date = v => v ? new Date(v).toLocaleString("ja-JP", JST_OPTIONS) : "-";\n  const jstDateTimeValue = v => { if (!v) return ""; const d = new Date(v); if (Number.isNaN(d.getTime())) return ""; return new Intl.DateTimeFormat("sv-SE", { timeZone:"Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).format(d).replace(" ", "T"); };\n  const jstInputToIso = value => { if (!value) return null; const m = value.match(/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})(?::(\\d{2}))?$/); if (!m) return null; return new Date(Date.UTC(Number(m[1]), Number(m[2])-1, Number(m[3]), Number(m[4])-9, Number(m[5]), Number(m[6] || 0))).toISOString(); };
  const statusLabel=v=>({admin:"管理者",user:"一般ユーザー",active:"有効",banned:"BAN",suspended:"一時停止",draft:"下書き",published:"公開中",archived:"アーカイブ",visible:"表示",hidden:"非表示",deleted:"削除済み",open:"未対応",reviewing:"確認中",resolved:"解決済み",dismissed:"却下",closed:"終了"})[v]||v;
  const errorMessage=e=>{const m=String(e?.message||e||"");if(/permission denied|not authorized|row-level security/i.test(m))return "この操作を行う権限がありません。";if(/network|fetch failed/i.test(m))return "通信に失敗しました。";return "処理に失敗しました。しばらくしてからもう一度お試しください。";};

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

  function renderDashboard(stats) {
    const totals=stats?.totals||{};
    $("dashboard-stats").innerHTML=[
      ["今日のアクセス",totals.today||0],["ユーザー",totals.users||0],["記事",totals.articles||0],
      ["未処理の通報",totals.open_reports||0],["未処理の問い合わせ",totals.open_inquiries||0]
    ].map(x=>'<div class="stat-card"><div class="stat-number">'+esc(x[1])+'</div><div class="stat-label">'+esc(x[0])+'</div></div>').join("");
    const rows=stats?.daily||[];
    if(!rows.length){$("access-chart").innerHTML='<div class="admin-muted">まだアクセスデータがありません。</div>';return;}
    const max=Math.max(...rows.map(x=>Number(x.visits)||0),1), w=900,h=250,p=36;
    const pts=rows.map((x,i)=>{const xx=p+(rows.length===1?0:(w-p*2)*i/(rows.length-1));const yy=h-p-(Number(x.visits)||0)/max*(h-p*2);return [xx,yy,x];});
    const poly=pts.map(x=>x[0]+","+x[1]).join(" ");
    const circles=pts.map(x=>'<circle cx="'+x[0]+'" cy="'+x[1]+'" r="4"><title>'+esc(x[2].day)+': '+esc(x[2].visits)+'</title></circle>').join("");
    const labels=pts.map(x=>'<text x="'+x[0]+'" y="'+(h-8)+'" text-anchor="middle" font-size="11">'+esc(String(x[2].day).slice(5))+'</text>').join("");
    $("access-chart").innerHTML='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="過去30日間のアクセス数"><polyline points="'+poly+'" fill="none" stroke="currentColor" stroke-width="3"/>'+circles+labels+'</svg>';
  }

  async function loadDashboard() {
    const {data,error}=await supabase.rpc("admin_dashboard_stats");
    if(error) throw error;
    const stats=Array.isArray(data)?data[0]:data;
    renderDashboard(stats);
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
      .select("id,username,display_name,role,account_status,ban_reason,ban_expires_at,created_at")
      .order("created_at", { ascending:false });
    if (error) throw error;
    $("users-body").innerHTML = data.length ? data.map(u => `
      <tr>
        <td>${esc(u.username || u.id)}</td>
        <td>${esc(u.display_name || "-")}</td>
        <td><span class="admin-badge">${esc(statusLabel(u.role))}</span></td>
        <td>
          <span class="admin-badge">${esc(statusLabel(u.account_status || "active"))}</span>
          ${u.ban_reason ? '<div class="admin-muted" style="margin-top:6px;white-space:pre-wrap">'+esc(u.ban_reason)+'</div>' : ''}
        </td>
        <td>${esc(date(u.created_at))}</td>
        <td class="admin-actions">
          <button type="button" class="user-role" data-id="${esc(u.id)}" data-role="${esc(u.role)}">${u.role === "admin" ? "userに変更" : "adminに変更"}</button>
          <select class="account-status" data-id="${esc(u.id)}" data-current="${esc(u.account_status || "active")}" aria-label="アカウント状態">
            ${["active","banned","suspended"].map(s => '<option value="'+s+'" '+(s===(u.account_status||"active")?"selected":"")+'>'+statusLabel(s)+'</option>').join("")}
          </select>
          <label style="display:flex;flex-direction:column;gap:4px;width:230px">
            <span class="admin-muted">BAN解除日時（JST）</span>
            <input class="ban-expires" data-id="${esc(u.id)}" type="datetime-local" step="1" value="${esc(jstDateTimeValue(u.ban_expires_at))}" aria-label="BAN解除日時（JST）">
          </label>
          <button type="button" class="account-status-save" data-id="${esc(u.id)}">状態を保存</button>
        </td>
      </tr>`).join("") : '<tr><td colspan="6">ユーザーはいません。</td></tr>';
    document.querySelectorAll(".user-role").forEach(b => b.onclick = () => changeRole(b.dataset.id,b.dataset.role));
    document.querySelectorAll(".account-status-save").forEach(b => b.onclick = () => saveAccountStatus(b.dataset.id));
  }

  async function saveAccountStatus(id) {
    const select = document.querySelector('.account-status[data-id="' + CSS.escape(id) + '"]');
    const expiryInput = document.querySelector('.ban-expires[data-id="' + CSS.escape(id) + '"]');
    const status = select ? select.value : "active";

    if (status !== "active") {
      const reason = prompt("BAN・一時停止の理由を入力してください。");
      if (reason === null) return;
      if (!reason.trim()) {
        alert("理由を入力してください。");
        return;
      }

      const expiryValue = expiryInput ? expiryInput.value.trim() : "";
      let expiresAt = null;
      if (expiryValue) {
        expiresAt = jstInputToIso(expiryValue);
        if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
          alert("BAN解除日時は現在より後の正しい日時にしてください。");
          return;
        }
      }

      const label = expiresAt
        ? statusLabel(status) + "（" + date(expiresAt) + " JSTに解除）"
        : statusLabel(status) + "（無期限）";
      if (!confirm("このアカウントを「" + label + "」にしますか？")) return;

      const { error } = await supabase.from("profiles").update({
        account_status: status,
        ban_reason: reason.trim(),
        ban_expires_at: expiresAt
      }).eq("id", id);
      if (error) {
        alert("アカウント状態の変更に失敗しました: " + errorMessage(error));
        await loadUsers();
        return;
      }
    } else {
      if (!confirm("このアカウントの利用制限を解除しますか？")) return;
      const { error } = await supabase.from("profiles").update({
        account_status: "active",
        ban_reason: null,
        ban_expires_at: null
      }).eq("id", id);
      if (error) {
        alert("アカウント状態の変更に失敗しました: " + errorMessage(error));
        await loadUsers();
        return;
      }
    }
    await loadUsers();
  }

  async function changeRole(id, current) {
    const next = current === "admin" ? "user" : "admin";
    if (!confirm("このユーザーを " + next + " に変更しますか？")) return;
    const { error } = await supabase.from("profiles").update({ role:next }).eq("id",id);
    if (error) { alert("権限変更に失敗しました: " + errorMessage(error)); return; }
    await loadUsers();
    const { data } = await supabase.rpc("admin_access_check");
    renderAudit((Array.isArray(data) ? data[0] : data)?.recent_role_changes || []);
  }

  async function loadArticles() {
    const { data, error } = await supabase.from("articles")
      .select("id,title,status,created_at,profiles(username,display_name)").order("created_at",{ascending:false});
    if (error) throw error;
    $("articles-body").innerHTML = data.length ? data.map(a => `
      <tr><td>${esc(a.title)}</td><td>${esc(a.profiles?.display_name || a.profiles?.username || "-")}</td><td><span class="admin-badge">${esc(statusLabel(a.status))}</span></td><td>${esc(date(a.created_at))}</td>
      <td><select class="article-status" data-id="${esc(a.id)}">${["draft","published","archived"].map(s => `<option value="${s}" ${s===a.status?"selected":""}>${statusLabel(s)}</option>`).join("")}</select></td></tr>`).join("") : '<tr><td colspan="5">記事はありません。</td></tr>';
    document.querySelectorAll(".article-status").forEach(s => s.onchange = () => updateArticle(s.dataset.id,s.value));
  }
  async function updateArticle(id,status) {
    const { error } = await supabase.from("articles").update({status}).eq("id",id);
    if (error) { alert("記事状態の変更に失敗しました: " + errorMessage(error)); await loadArticles(); }
  }

  async function loadComments() {
    const { data, error } = await supabase.from("comments")
      .select("id,content,status,created_at,profiles(username,display_name)").order("created_at",{ascending:false});
    if (error) throw error;
    $("comments-body").innerHTML = data.length ? data.map(c => `
      <tr><td class="admin-log">${esc(c.content)}</td><td>${esc(c.profiles?.display_name || c.profiles?.username || "-")}</td><td><span class="admin-badge">${esc(statusLabel(c.status))}</span></td><td>${esc(date(c.created_at))}</td>
      <td><select class="comment-status" data-id="${esc(c.id)}">${["visible","hidden","deleted"].map(s => `<option value="${s}" ${s===c.status?"selected":""}>${s}</option>`).join("")}</select></td></tr>`).join("") : '<tr><td colspan="5">コメントはありません。</td></tr>';
    document.querySelectorAll(".comment-status").forEach(s => s.onchange = () => updateComment(s.dataset.id,s.value));
  }
  async function updateComment(id,status) {
    const { error } = await supabase.from("comments").update({status}).eq("id",id);
    if (error) { alert("コメント状態の変更に失敗しました: " + errorMessage(error)); await loadComments(); }
  }

  async function loadInquiries() {
    const { data, error } = await supabase.from("inquiries")
      .select("id,name,email,subject,message,status,admin_note,created_at,resolved_at")
      .order("created_at",{ascending:false});
    if(error) throw error;
    $("inquiries-body").innerHTML=data.length?data.map(i=>'<tr><td>'+esc(i.subject)+'</td><td>'+esc(i.name||"-")+'<br>'+esc(i.email||"-")+'</td><td class="inquiry-message">'+esc(i.message)+'</td><td><select class="inquiry-status" data-id="'+esc(i.id)+'">'+["open","reviewing","resolved","closed"].map(s=>'<option value="'+s+'" '+(s===i.status?"selected":"")+''+statusLabel(s)+'</option>').join("")+'</select><br><textarea class="inquiry-note" data-id="'+esc(i.id)+'" placeholder="管理者メモ">'+esc(i.admin_note||"")+'</textarea><br><button type="button" class="inquiry-save" data-id="'+esc(i.id)+'">保存</button></td><td>'+esc(date(i.created_at))+'</td></tr>').join(""):'<tr><td colspan="6">問い合わせはありません。</td></tr>';
    document.querySelectorAll(".inquiry-save").forEach(b=>b.onclick=()=>saveInquiry(b.dataset.id));
  }
  async function saveInquiry(id){
    const status=document.querySelector('.inquiry-status[data-id="'+CSS.escape(id)+'"]').value;
    const note=document.querySelector('.inquiry-note[data-id="'+CSS.escape(id)+'"]').value;
    const {error}=await supabase.from("inquiries").update({status,admin_note:note,resolved_at:["resolved","closed"].includes(status)?new Date().toISOString():null}).eq("id",id);
    if(error){alert("問い合わせの更新に失敗しました: "+errorMessage(error));return;}
    await loadInquiries(); await loadDashboard();
  }

  async function loadReports() {
    const { data, error } = await supabase.from("reports")
      .select("id,article_id,comment_id,reason,status,admin_note,created_at").order("created_at",{ascending:false});
    if (error) throw error;
    $("reports-body").innerHTML = data.length ? data.map(r => `
      <tr><td>${esc(r.article_id ? "記事: " + r.article_id : "コメント: " + r.comment_id)}</td><td class="admin-log">${esc(r.reason)}</td><td><span class="admin-badge">${esc(statusLabel(r.status))}</span></td><td>${esc(date(r.created_at))}</td>
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
    if (error) { alert("通報の更新に失敗しました: " + errorMessage(error)); return; }
    await loadReports();
  }

  async function init() {
    if (!(await checkAdmin())) return;
    try {
      await Promise.all([loadDashboard(),loadUsers(),loadArticles(),loadComments(),loadReports(),loadInquiries()]);
    } catch (e) {
      console.error(e);
      alert("管理データの読み込みに失敗しました: " + errorMessage(e));
    }
  }
  init();
})();