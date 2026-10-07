(() => {
  "use strict";
  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const $ = (id) => document.getElementById(id);
  let currentAdminRole = "user";

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
  const JST_OPTIONS = { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
  const date = v => v ? new Date(v).toLocaleString("ja-JP", JST_OPTIONS) : "-";
  const jstDateTimeValue = v => { if (!v) return ""; const d = new Date(v); if (Number.isNaN(d.getTime())) return ""; return new Intl.DateTimeFormat("sv-SE", { timeZone:"Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).format(d).replace(" ", "T"); };
  const jstInputToIso = value => { if (!value) return null; const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/); if (!m) return null; return new Date(Date.UTC(Number(m[1]), Number(m[2])-1, Number(m[3]), Number(m[4])-9, Number(m[5]), Number(m[6] || 0))).toISOString(); };
  const statusLabel=v=>({admin:"管理者",moderator:"モデレーター",user:"一般ユーザー",active:"有効",banned:"BAN",suspended:"一時停止",draft:"下書き",published:"公開中",archived:"アーカイブ",visible:"表示",hidden:"非表示",deleted:"削除済み",open:"未対応",reviewing:"確認中",resolved:"解決済み",dismissed:"却下",closed:"終了"})[v]||v;
  const errorMessage=e=>{const m=String(e?.message||e||"");if(/permission denied|not authorized|row-level security/i.test(m))return "この操作を行う権限がありません。";if(/network|fetch failed/i.test(m))return "通信に失敗しました。";return "処理に失敗しました。しばらくしてからもう一度お試しください。";};

  function forbidden(message, detail = "") {
    $("admin-loading").classList.add("hidden");
    $("admin-app").classList.add("hidden");
    $("admin-forbidden").classList.remove("hidden");
    $("admin-forbidden-reason").textContent = message;
    const detailEl = $("admin-forbidden-detail");
    if (detailEl) detailEl.textContent = detail;
  }

  async function checkAdmin() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("管理者チェック: セッション取得失敗", sessionError);
      forbidden("ログイン状態の確認に失敗しました。", "Supabaseセッションの取得に失敗しました。");
      return false;
    }

    if (!session?.user?.id) {
      location.href = "login.html";
      return false;
    }

    const userId = session.user.id;
    console.info("管理者チェック: ログイン中ユーザー", userId);

    // 管理者判定はRPCだけに依存せず、現在のユーザー自身のprofiles.roleを
    // RLS経由で直接確認する。これによりPostgRESTの関数キャッシュ等で
    // admin_access_check() が一時的に呼び出せない場合でも管理画面へ入れる。
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role,account_status")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      console.error("管理者チェック: profiles取得失敗", profileError);
      forbidden("管理者権限の確認に失敗しました。", "Kiziminプロフィールの読み込みに失敗しました。");
      return false;
    }

    if (!profile) {
      forbidden("管理者権限の確認に失敗しました。", "ログインユーザーのKiziminプロフィールが見つかりません。");
      return false;
    }

    if (profile.account_status && profile.account_status !== "active") {
      forbidden("このアカウントは管理画面を利用できません。", "アカウント状態: " + profile.account_status);
      return false;
    }

    if (!["admin","moderator"].includes(profile.role)) {
      forbidden(
        "管理画面へのアクセスが拒否されました。",
        "現在のKiziminプロフィール権限: " + (profile.role || "不明") + " / ログインユーザーID: " + userId
      );
      return false;
    }

    currentAdminRole = profile.role;
    $("admin-loading").classList.add("hidden");
    $("admin-app").classList.remove("hidden");
    const maintenancePanel = $("maintenance-panel");
    if (maintenancePanel) maintenancePanel.classList.toggle("hidden", currentAdminRole !== "admin");

    // 監査情報は補助機能。ここが失敗しても管理画面自体は表示する。
    try {
      const { data, error } = await supabase.rpc("admin_access_check");
      if (error) {
        console.warn("管理者チェックRPCは利用できません。監査表示を省略します。", error);
        renderAudit([]);
      } else {
        const result = Array.isArray(data) ? data[0] : data;
        renderAudit(result?.recent_role_changes || []);
      }
    } catch (error) {
      console.warn("管理者チェックRPC呼び出し失敗", error);
      renderAudit([]);
    }

    return true;
  }

  function renderDashboard(stats) {
    const totals = stats?.totals || {};
    $("dashboard-stats").innerHTML = [
      ["今日のアクセス", totals.today || 0],
      ["ユーザー", totals.users || 0],
      ["記事", totals.articles || 0],
      ["未処理の通報", totals.open_reports || 0],
      ["未処理の問い合わせ", totals.open_inquiries || 0]
    ].map(x =>
      '<div class="stat-card"><div class="stat-number">' + esc(x[1]) +
      '</div><div class="stat-label">' + esc(x[0]) + '</div></div>'
    ).join("");

    const rows = Array.isArray(stats?.daily) ? stats.daily : [];
    const chart = $("access-chart");

    if (!rows.length) {
      chart.innerHTML = '<div class="admin-muted chart-empty">まだアクセスデータがありません。</div>';
      return;
    }

    const values = rows.map(x => Math.max(0, Number(x.visits) || 0));
    const maxValue = Math.max(...values, 1);
    const yMax = Math.ceil(maxValue / 5) * 5 || 5;

    const width = 1000;
    const height = 340;
    const left = 58;
    const right = 24;
    const top = 24;
    const bottom = 54;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const slotW = plotW / rows.length;
    const barW = Math.max(8, Math.min(24, slotW * 0.58));

    const y = value => top + plotH - (value / yMax) * plotH;

    const grid = Array.from({ length: 6 }, (_, i) => {
      const value = Math.round(yMax * (5 - i) / 5);
      const yy = y(value);
      return '<line class="chart-grid" x1="' + left + '" y1="' + yy + '" x2="' + (width - right) +
        '" y2="' + yy + '"></line>' +
        '<text class="chart-y-label" x="' + (left - 10) + '" y="' + (yy + 4) +
        '" text-anchor="end">' + esc(value) + '</text>';
    }).join("");

    const labelIndexes = [];
    const labelCount = Math.min(6, rows.length);
    for (let i = 0; i < labelCount; i++) {
      labelIndexes.push(Math.round(i * (rows.length - 1) / Math.max(1, labelCount - 1)));
    }

    const labels = labelIndexes.map(i => {
      const cx = left + slotW * i + slotW / 2;
      const day = String(rows[i].day || "").slice(5);
      return '<text class="chart-x-label" x="' + cx + '" y="' + (height - 16) +
        '" text-anchor="middle">' + esc(day) + '</text>';
    }).join("");

    const bars = rows.map((row, i) => {
      const value = values[i];
      const x = left + slotW * i + (slotW - barW) / 2;
      const barHeight = value === 0 ? 2 : Math.max(2, (value / yMax) * plotH);
      const barY = top + plotH - barHeight;
      const day = String(row.day || "");
      const label = day.replace(/^(\d{4})-/, "$1/");
      return '<g class="chart-bar-group" tabindex="0" data-day="' + esc(label) +
        '" data-value="' + esc(value) + '">' +
        '<rect class="chart-bar-hit" x="' + x.toFixed(1) + '" y="' + top +
        '" width="' + Math.max(barW, slotW * 0.9).toFixed(1) + '" height="' + plotH +
        '" transform="translate(' + ((slotW * 0.9 - barW) / -2).toFixed(1) + ' 0)"></rect>' +
        '<rect class="chart-bar" x="' + x.toFixed(1) + '" y="' + barY.toFixed(1) +
        '" width="' + barW.toFixed(1) + '" height="' + barHeight.toFixed(1) +
        '" rx="4"></rect></g>';
    }).join("");

    chart.innerHTML =
      '<div class="chart-head"><div><strong>アクセス数</strong><span>過去30日間</span></div>' +
      '<div class="chart-total">' + esc(values.reduce((a, b) => a + b, 0)) + '<small>アクセス</small></div></div>' +
      '<div class="chart-scroll"><svg viewBox="0 0 ' + width + ' ' + height +
      '" role="img" aria-label="過去30日間のアクセス数">' +
      grid + bars + labels + '</svg>' +
      '<div class="chart-tooltip" role="status" aria-live="polite"></div></div>';

    const tooltip = chart.querySelector(".chart-tooltip");
    const groups = chart.querySelectorAll(".chart-bar-group");

    const showTooltip = group => {
      const day = group.dataset.day || "-";
      const value = Number(group.dataset.value) || 0;
      tooltip.innerHTML = '<strong>' + esc(day) + '</strong><span>' + esc(value) + ' アクセス</span>';
      tooltip.classList.add("visible");

      const chartRect = chart.querySelector(".chart-scroll").getBoundingClientRect();
      const barRect = group.querySelector(".chart-bar").getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      let leftPos = barRect.left - chartRect.left + (barRect.width / 2) - (tooltipRect.width / 2);
      leftPos = Math.max(8, Math.min(leftPos, chartRect.width - tooltipRect.width - 8));
      tooltip.style.left = leftPos + "px";
      tooltip.style.top = Math.max(4, barRect.top - chartRect.top - tooltipRect.height - 8) + "px";
    };

    const hideTooltip = () => tooltip.classList.remove("visible");

    groups.forEach(group => {
      group.addEventListener("mouseenter", () => showTooltip(group));
      group.addEventListener("mouseleave", hideTooltip);
      group.addEventListener("focus", () => showTooltip(group));
      group.addEventListener("blur", hideTooltip);
    });
  }

  async function loadMaintenance() {
    const { data, error } = await supabase.from("site_settings").select("maintenance_mode").eq("id", true).maybeSingle();
    if (error) throw error;
    const enabled = !!data?.maintenance_mode;
    const toggle = $("maintenance-toggle");
    if (toggle) toggle.checked = enabled;
    const status = $("maintenance-status");
    if (status) status.textContent = enabled
      ? "現在オンです。一般ユーザーはサイトを利用できません。"
      : "現在オフです。通常どおりサイトを利用できます。";
  }

  async function setMaintenance(enabled) {
    const toggle = $("maintenance-toggle");
    const status = $("maintenance-status");
    if (toggle) toggle.disabled = true;
    try {
      const { error } = await supabase.rpc("admin_set_maintenance_mode", {
        p_enabled: enabled
      });
      if (error) throw error;
      if (status) status.textContent = enabled
        ? "メンテナンスモードをオンにしました。一般ユーザーは利用できません。"
        : "メンテナンスモードをオフにしました。通常利用できます。";
    } catch (e) {
      if (toggle) toggle.checked = !enabled;
      alert("メンテナンス設定の変更に失敗しました: " + errorMessage(e));
    } finally {
      if (toggle) toggle.disabled = false;
    }
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
          <label class="ban-expiry-field">
            <span class="admin-muted">BAN解除日時（JST）</span>
            <input class="ban-expires" data-id="${esc(u.id)}" type="datetime-local" step="1" value="${esc(jstDateTimeValue(u.ban_expires_at))}" aria-label="BAN解除日時（JST）">
          </label>
          <button type="button" class="account-status-save" data-id="${esc(u.id)}">状態を保存</button>
          ${currentAdminRole === "admin" ? `<button type="button" class="user-delete" data-id="${esc(u.id)}" data-name="${esc(u.display_name || u.username || u.id)}">強制削除</button>` : ""}
        </td>
      </tr>`).join("") : '<tr><td colspan="6">ユーザーはいません。</td></tr>';
    document.querySelectorAll(".user-role").forEach(b => b.onclick = () => changeRole(b.dataset.id,b.dataset.role));
    document.querySelectorAll(".account-status-save").forEach(b => b.onclick = () => saveAccountStatus(b.dataset.id));
    document.querySelectorAll(".user-delete").forEach(b => b.onclick = () => forceDeleteUser(b.dataset.id, b.dataset.name));
  }

  async function forceDeleteUser(id, name) {
    const first = confirm("「" + name + "」のアカウントを強制削除しますか？\n\nこの操作は元に戻せません。投稿・コメントなど、このアカウントに紐づくデータも削除されます。");
    if (!first) return;
    const second = prompt("確認のため、削除対象のユーザー名を入力してください。\nキャンセルで中止します。");
    if (second === null) return;
    if (second.trim() !== name.trim()) {
      alert("入力が一致しないため、削除を中止しました。");
      return;
    }
    const buttons = document.querySelectorAll('.user-delete[data-id="' + CSS.escape(id) + '"]');
    buttons.forEach(b => { b.disabled = true; b.textContent = "削除中…"; });
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", { body: { user_id: id } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "削除に失敗しました。");
      alert("アカウントを完全に削除しました。");
      await loadUsers();
    } catch (e) {
      console.error("強制削除失敗", e);
      alert("アカウントの強制削除に失敗しました: " + (e?.context?.error || e?.message || "不明なエラー"));
      await loadUsers();
    }
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
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id;
    if (currentUserId === id && current === "admin") {
      alert("自分自身の管理者権限は、この画面から解除できません。");
      return;
    }
    const next = current === "admin" ? "user" : "admin";
    if (!confirm("このユーザーを " + next + " に変更しますか？")) return;
    const { error } = await supabase.from("profiles").update({ role:next }).eq("id",id);
    if (error) { alert("権限変更に失敗しました: " + errorMessage(error)); return; }
    await loadUsers();
    try {
      const { data } = await supabase.rpc("admin_access_check");
      renderAudit((Array.isArray(data) ? data[0] : data)?.recent_role_changes || []);
    } catch (e) {
      console.warn("権限監査の再取得に失敗", e);
    }
  }

  async function loadArticles() {
    const body = $("articles-body");
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5"><div class="admin-muted">記事を読み込んでいます...</div></td></tr>';
    try {
      const { data, error } = await supabase.rpc("admin_list_articles");
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      body.innerHTML = rows.length ? rows.map(a => `
        <tr>
          <td>${esc(a.title)}</td>
          <td>${esc(a.author_name || "-")}</td>
          <td><span class="admin-badge">${esc(statusLabel(a.status))}</span></td>
          <td>${esc(date(a.created_at))}</td>
          <td>
            <select class="article-status" data-id="${esc(a.id)}" aria-label="記事状態">
              ${["draft","published","archived"].map(s => `<option value="${s}" ${s===a.status?"selected":""}>${statusLabel(s)}</option>`).join("")}
            </select>
          </td>
        </tr>`).join("") : '<tr><td colspan="5">記事はありません。</td></tr>';
      document.querySelectorAll(".article-status").forEach(s => {
        s.onchange = () => updateArticle(s.dataset.id, s.value, s);
      });
    } catch (error) {
      console.error("記事一覧の読み込みに失敗しました:", error);
      body.innerHTML = '<tr><td colspan="5"><div class="admin-alert">記事を読み込めませんでした。権限または通信状態を確認してください。</div></td></tr>';
    }
  }

  async function updateArticle(id,status,selectEl) {
    if (!id || !["draft","published","archived"].includes(status)) return;
    const previous = selectEl?.dataset.previous || selectEl?.querySelector("option:checked")?.value;
    if (selectEl) selectEl.disabled = true;
    try {
      const { data, error } = await supabase.from("articles").update({status}).eq("id",id).select("id,status").single();
      if (error) throw error;
      if (!data) throw new Error("記事の更新対象が見つかりませんでした。");
      if (selectEl) selectEl.dataset.previous = data.status;
    } catch (error) {
      console.error("記事状態の変更に失敗しました:", error);
      alert("記事の状態を更新できませんでした。\n\n" + (error?.message || "権限または通信状態を確認してください。"));
      if (selectEl && previous) selectEl.value = previous;
    } finally {
      if (selectEl) selectEl.disabled = false;
    }
  }

  async function loadComments() {
    try {
      const data = await secureContent("admin_comments_list");
      const rows = data.comments || [];
      $("comments-body").innerHTML = rows.length ? rows.map(c => '<tr><td class="admin-log">' + esc(c.content) + '</td><td>' + esc(c.profiles?.display_name || c.profiles?.username || "-") + '</td><td><span class="admin-badge">' + esc(statusLabel(c.status)) + '</span></td><td>' + esc(date(c.created_at)) + '</td><td><select class="comment-status" data-id="' + esc(c.id) + '">' + ["visible","hidden","deleted"].map(x => '<option value="' + x + '" ' + (x===c.status?"selected":"") + '>' + statusLabel(x) + '</option>').join("") + '</select></td></tr>').join("") : '<tr><td colspan="5">コメントはありません。</td></tr>';
      document.querySelectorAll(".comment-status").forEach(s => s.onchange = () => updateComment(s.dataset.id,s.value));
    } catch (e) {
      console.error("コメント一覧の読み込みに失敗しました:", e);
      const body = $("comments-body");
      if (body) body.innerHTML = '<tr><td colspan="5"><div class="admin-alert">コメントを読み込めませんでした。' + esc(errorMessage(e)) + '</div></td></tr>';
    }
  }
  async function updateComment(id,status) {
    try { await secureContent("comment_status",{comment_id:id,status}); }
    catch (error) { alert("コメント状態の変更に失敗しました: " + errorMessage(error)); await loadComments(); }
  }

  async function loadInquiries() {
    const { data, error } = await supabase.from("inquiries")
      .select("id,name,email,subject,message,status,admin_note,created_at,resolved_at")
      .order("created_at",{ascending:false});
    if(error) throw error;
    $("inquiries-body").innerHTML=data.length?data.map(i=>'<tr><td>'+esc(i.subject)+'</td><td>'+esc(i.name||"-")+'<br>'+esc(i.email||"-")+'</td><td class="inquiry-message">'+esc(i.message)+'</td><td><select class="inquiry-status" data-id="'+esc(i.id)+'">'+["open","reviewing","resolved","closed"].map(s=>'<option value="'+s+'" '+(s===i.status?"selected":"")+'>'+statusLabel(s)+'</option>').join("")+'</select><br><textarea class="inquiry-note" data-id="'+esc(i.id)+'" placeholder="管理者メモ">'+esc(i.admin_note||"")+'</textarea><br><button type="button" class="inquiry-save" data-id="'+esc(i.id)+'">保存</button></td><td>'+esc(date(i.created_at))+'</td></tr>').join(""):'<tr><td colspan="6">問い合わせはありません。</td></tr>';
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

  async function secureContent(action, extra = {}) {
    const { data, error } = await supabase.functions.invoke("secure-content", { body: { action, ...extra } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function loadDmManagement() {
    const box = $("dm-admin-conversations");
    if (!box) return;
    box.textContent = "読み込み中…";
    const data = await secureContent("dm_admin_conversations");
    const conversations = data.conversations || [];
    box.innerHTML = conversations.length ? conversations.map(c => {
      const names = (c.members || []).map(m => m.profiles?.display_name || m.profiles?.username || "ユーザー").join(" / ");
      return '<button class="dm-admin-conv" data-id="' + esc(c.id) + '"><div class="dm-admin-conv-name">' + esc(names || "ユーザー") + '</div><div class="dm-admin-conv-meta">' + esc(date(c.updated_at)) + '</div></button>';
    }).join("") : '<div class="admin-muted" style="padding:18px">DMはありません。</div>';
    document.querySelectorAll(".dm-admin-conv").forEach(b => b.onclick = () => loadDmAdminMessages(b.dataset.id));
  }

  async function loadDmAdminMessages(id) {
    const head = $("dm-admin-head"), box = $("dm-admin-messages");
    if (!box) return;
    head.textContent = "DMを読み込んでいます…";
    box.innerHTML = '<div class="admin-muted">読み込み中…</div>';
    try {
      const data = await secureContent("dm_admin_messages", { conversation_id: id });
      const conv = document.querySelector('.dm-admin-conv[data-id="' + CSS.escape(id) + '"]');
      document.querySelectorAll(".dm-admin-conv").forEach(x => x.classList.toggle("active", x === conv));
      head.textContent = "DM管理";
      box.innerHTML = (data.messages || []).map(m => '<div class="dm-admin-message"><div class="dm-admin-message-text">' + esc(m.content) + '</div><div class="dm-admin-message-meta"><span>' + esc(date(m.created_at)) + '</span><button class="dm-admin-delete" type="button" data-message="' + esc(m.id) + '">このメッセージを削除</button></div></div>').join("") || '<div class="admin-muted">メッセージはありません。</div>';
      document.querySelectorAll(".dm-admin-delete").forEach(b => b.onclick = async () => {
        if (!confirm("このDMを削除しますか？")) return;
        b.disabled = true;
        try { await secureContent("dm_admin_delete_message", { message_id: b.dataset.message }); await loadDmAdminMessages(id); }
        catch (e) { alert("DMの削除に失敗しました: " + errorMessage(e)); b.disabled = false; }
      });
    } catch (e) { head.textContent = "DM管理"; box.innerHTML = '<div class="admin-alert">DMを読み込めませんでした。' + esc(errorMessage(e)) + '</div>'; }
  }

  async function loadNotificationHistory() {
    const body = $("notification-history-body");
    if (!body) return;
    body.innerHTML = '<tr><td colspan="6">読み込み中...</td></tr>';
    const { data, error } = await supabase
      .from("notifications")
      .select("sender_id,title,body,link_url,created_at,type,sender:sender_id(id,username,display_name)")
      .eq("type", "broadcast")
      .order("created_at", { ascending:false })
      .limit(1000);
    if (error) throw error;

    const groups = new Map();
    for (const n of data || []) {
      const key = [n.created_at, n.sender_id, n.title, n.body, n.link_url || ""].join("\u0000");
      if (!groups.has(key)) groups.set(key, { ...n, count: 0 });
      groups.get(key).count += 1;
    }
    const rows = Array.from(groups.values());
    body.innerHTML = rows.length ? rows.map(n => '<tr>' +
      '<td>' + esc(date(n.created_at)) + '</td>' +
      '<td>' + esc(n.sender?.display_name || n.sender?.username || n.sender_id || "-") +
      (n.sender?.username ? '<div class="admin-muted">@' + esc(n.sender.username) + '</div>' : '') + '</td>' +
      '<td>' + esc(n.title) + '</td>' +
      '<td class="admin-log">' + esc(n.body) + '</td>' +
      '<td>' + esc(n.link_url || "-") + '</td>' +
      '<td>' + esc(n.count) + '人</td>' +
      '</tr>').join("") : '<tr><td colspan="6">送信履歴はありません。</td></tr>';
  }

  async function broadcastNotification() {
    const title = $("broadcast-title")?.value.trim();
    const body = $("broadcast-body")?.value.trim() || "";
    const link = $("broadcast-link")?.value.trim() || null;
    const result = $("broadcast-result");
    const button = $("broadcast-send");
    if (!title) { alert("通知タイトルを入力してください。"); return; }
    if (!confirm("この通知を全ユーザーに送信しますか？")) return;
    button.disabled = true;
    result.textContent = "送信しています...";
    try {
      const { data, error } = await supabase.rpc("admin_broadcast_notification", {
        p_title: title,
        p_body: body,
        p_link_url: link
      });
      if (error) throw error;
      result.textContent = String(data || 0) + "人に通知を送信しました。";
      $("broadcast-title").value = "";
      $("broadcast-body").value = "";
      $("broadcast-link").value = "";
    } catch (e) {
      result.textContent = "";
      alert("通知の送信に失敗しました: " + errorMessage(e));
    } finally {
      button.disabled = false;
    }
  }

  const viewMeta = {
    dashboard: ["ダッシュボード","Kiziminの状態をまとめて確認します。"],
    users: ["ユーザー管理","権限とアカウント状態を管理します。"],
    articles: ["記事管理","記事の公開状態を管理します。"],
    comments: ["コメント管理","コメントの表示状態を管理します。"],
    reports: ["通報管理","届いた通報を確認して対応します。"],
    inquiries: ["問い合わせ管理","問い合わせの対応状況を管理します。"],
    notifications: ["通知送信","管理者から全ユーザーへサイト内通知を送信し、送信履歴と実行者を確認します。"],
    "dm-management": ["DM管理","DMの確認と削除を管理します。"]
  };

  function setupAdminNavigation() {
    const buttons = document.querySelectorAll(".admin-nav [data-view]");
    const views = document.querySelectorAll(".admin-view");
    buttons.forEach(button => {
      button.addEventListener("click", () => {
        const key = button.dataset.view;
        buttons.forEach(b => b.classList.toggle("active", b === button));
        views.forEach(v => v.classList.toggle("active", v.id === "view-" + key));
        const meta = viewMeta[key] || viewMeta.dashboard;
        $("admin-view-title").textContent = meta[0];
        $("admin-view-subtitle").textContent = meta[1];
        history.replaceState(null, "", "#" + key);
        const loaders = {dashboard: loadDashboard, users: loadUsers, articles: loadArticles, comments: loadComments, reports: loadReports, inquiries: loadInquiries, notifications: loadNotificationHistory, "dm-management": loadDmManagement};
        const loader = loaders[key];
        if (loader) loader().catch(e => {
          console.error("管理セクション読み込みエラー", key, e);
          const body = document.querySelector("#view-" + key + " tbody");
          if (body) body.innerHTML = '<tr><td colspan="10"><div class="admin-alert">データを読み込めませんでした。'+esc(errorMessage(e))+'</div></td></tr>';
        });
      });
    });

    $("broadcast-send")?.addEventListener("click", broadcastNotification);

    $("maintenance-toggle")?.addEventListener("change", e => {
      const enabled = e.target.checked;
      if (!confirm(enabled ? "メンテナンスモードをオンにしますか？一般ユーザーは閲覧・投稿できなくなります。" : "メンテナンスモードをオフにしますか？")) {
        e.target.checked = !enabled;
        return;
      }
      setMaintenance(enabled);
    });

    $("user-search")?.addEventListener("input", e => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll("#users-body tr").forEach(row => {
        row.hidden = q && !row.textContent.toLowerCase().includes(q);
      });
    });

    $("admin-refresh")?.addEventListener("click", async () => {
      const button = $("admin-refresh");
      button.disabled = true;
      button.textContent = "↻ 更新中";
      const loaders = [
        ["ダッシュボード", loadDashboard],
        ["ユーザー", loadUsers],
        ["記事", loadArticles],
        ["コメント", loadComments],
        ["通報", loadReports],
        ["問い合わせ", loadInquiries],
        ["通知履歴", loadNotificationHistory]
      ];
      const failures = [];
      try {
        const results = await Promise.allSettled(loaders.map(([, loader]) => loader()));
        results.forEach((result, i) => {
          if (result.status === "rejected") {
            console.error("管理画面更新エラー:", loaders[i][0], result.reason);
            failures.push(loaders[i][0] + "：" + errorMessage(result.reason));
          }
        });
        if (failures.length) {
          alert("一部のデータを更新できませんでした。\n\n" + failures.join("\n"));
        }
      } finally {
        button.disabled = false;
        button.textContent = "↻ 更新";
      }
    });

    const hash = location.hash.slice(1);
    const initial = viewMeta[hash] ? hash : "dashboard";
    const button = document.querySelector('.admin-nav [data-view="' + initial + '"]');
    button?.click();
  }

  async function init() {
    if (!(await checkAdmin())) return;
    setupAdminNavigation();
    const loaders = [
      ["ダッシュボード", loadDashboard],
      ["メンテナンス設定", loadMaintenance],
      ["ユーザー", loadUsers],
      ["記事", loadArticles],
      ["コメント", loadComments],
      ["通報", loadReports],
      ["問い合わせ", loadInquiries],
      ["DM管理", loadDmManagement]
    ];
    const results = await Promise.allSettled(loaders.map(([, loader]) => loader()));
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error("管理データの読み込み失敗:", loaders[i][0], result.reason);
      }
    });
  }  init();
})();