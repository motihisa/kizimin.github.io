(() => {
  "use strict";
  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  if (!window.supabase?.createClient) { const loading=document.getElementById("admin-loading"); if(loading) loading.textContent="Supabaseライブラリを読み込めませんでした。ページを再読み込みしてください。"; console.error("Supabase SDK is unavailable."); return; }
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const $ = (id) => document.getElementById(id);
  let currentAdminRole = "user";
  let currentEffectivePermissions = new Set();

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
  const JST_OPTIONS = { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
  const date = v => v ? new Date(v).toLocaleString("ja-JP", JST_OPTIONS) : "-";
  const jstDateTimeValue = v => { if (!v) return ""; const d = new Date(v); if (Number.isNaN(d.getTime())) return ""; return new Intl.DateTimeFormat("sv-SE", { timeZone:"Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).format(d).replace(" ", "T"); };
  const jstInputToIso = value => { if (!value) return null; const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/); if (!m) return null; return new Date(Date.UTC(Number(m[1]), Number(m[2])-1, Number(m[3]), Number(m[4])-9, Number(m[5]), Number(m[6] || 0))).toISOString(); };
  const statusLabel=v=>({owner:"オーナー",admin:"管理者",moderator:"モデレーター",debugger:"デバッカー",user:"一般ユーザー",active:"有効",banned:"BAN",suspended:"一時停止",draft:"下書き",published:"公開中",archived:"アーカイブ",visible:"表示",hidden:"非表示",deleted:"削除済み",open:"未対応",reviewing:"確認中",resolved:"解決済み",dismissed:"却下",closed:"終了"})[v]||v;
  const errorMessage=e=>{const m=String(e?.message||e||"");if(/permission denied|not authorized|row-level security/i.test(m))return "この操作を行う権限がありません。";if(/network|fetch failed/i.test(m))return "通信に失敗しました。";return "処理に失敗しました。しばらくしてからもう一度お試しください。";};

  function forbidden(message, detail = "") {
    $("admin-loading")?.classList.add("hidden");
    $("admin-app")?.classList.add("hidden");
    $("admin-forbidden")?.classList.remove("hidden");
    const reasonEl = $("admin-forbidden-reason");
    if (reasonEl) reasonEl.textContent = message;
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
      // メンテナンス中は admin.html からログイン画面へ誘導しない。
      // 既存のログインセッションを持つ管理者は、下の通常の権限チェックへ進める。
      const { data: maintenanceActive, error: maintenanceError } = await supabase
        .rpc("get_site_maintenance_state");

      if (maintenanceError) {
        console.error("メンテナンス状態の確認に失敗しました", maintenanceError);
        forbidden(
          "メンテナンス状態を確認できません。",
          "安全のためログイン画面への移動を停止しました。少し待ってから再読み込みしてください。"
        );
        return false;
      }

      if (maintenanceActive === true) {
        forbidden(
          "現在メンテナンス中です。",
          "メンテナンス中は、未ログイン状態から管理画面へログインできません。サイト再開後にアクセスしてください。"
        );
        return false;
      }

      location.href = "login.html";
      return false;
    }

    const userId = session.user.id;
    window.__kiziminCurrentUserId = userId;
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

    const { data: ownerFlag, error: ownerFlagError } = await supabase.rpc("is_site_owner");
    const isOwner = !ownerFlagError && ownerFlag === true;

    const { data: effectiveRows, error: effectiveError } = await supabase.rpc("get_my_effective_permissions");
    if (effectiveError) {
      console.error("個別権限の確認に失敗しました", effectiveError);
      currentEffectivePermissions = new Set();
    } else {
      currentEffectivePermissions = new Set((effectiveRows || []).filter(row => row.allowed === true).map(row => row.permission_key));
    }
    const isStaffRole = ["admin","moderator"].includes(profile.role) || isOwner;
    const userUsablePermissions = ["moderate_comments","manage_reports","manage_inquiries","broadcast_notifications","manage_roles","ban_users","delete_accounts"];
    if (!isStaffRole && !userUsablePermissions.some(key => currentEffectivePermissions.has(key))) {
      if (currentEffectivePermissions.has("view_logs")) {
        location.href = "admin-operations.html";
        return false;
      }
      forbidden(
        "管理画面へのアクセスが拒否されました。",
        "このアカウントには管理画面で利用できる個別権限が設定されていません。"
      );
      return false;
    }

    currentAdminRole = isOwner ? "owner" : profile.role;
    window.__kiziminCurrentUserRole = currentAdminRole;
    const viewPermission = {
      dashboard: null, users: null, articles: null, permissions: null,
      comments: "moderate_comments", reports: "manage_reports",
      inquiries: "manage_inquiries", notifications: "broadcast_notifications"
    };
    document.querySelectorAll(".admin-nav [data-view]").forEach(button => {
      const key = button.dataset.view;
      const allowed = isStaffRole || (key === "users" ? ["manage_roles","ban_users","delete_accounts"].some(permission => currentEffectivePermissions.has(permission)) : (viewPermission[key] && currentEffectivePermissions.has(viewPermission[key])));
      button.classList.toggle("hidden", !allowed);
      document.getElementById("view-" + key)?.classList.toggle("hidden", !allowed);
    });
    document.querySelector('a[href="admin-site-editor.html"]')?.classList.toggle("hidden", !isOwner);
    document.querySelector(".owner-only-email-tool")?.classList.toggle("hidden", !isOwner);
    document.querySelector(".owner-only-pentest-tool")?.classList.toggle("hidden", !isOwner);
    document.querySelector('.admin-nav [data-view="permissions"]')?.classList.toggle("hidden", !isOwner);
    $("view-permissions")?.classList.toggle("hidden", !isOwner);
    if (!isOwner && location.hash === "#permissions") history.replaceState(null, "", "#dashboard");
    $("admin-loading").classList.add("hidden");
    $("admin-app").classList.remove("hidden");
    const maintenancePanel = $("maintenance-panel");
    if (maintenancePanel) maintenancePanel.classList.toggle("hidden", !["admin","owner"].includes(currentAdminRole));

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


  // ネイティブselectの値・changeイベントは維持し、表示だけ管理画面独自のメニューにする。
  function enhanceAdminSelect(select) {
    if (!(select instanceof HTMLSelectElement) || select.id === "user-permission-target" || select.dataset.customized === "true") return;
    if (!select.options.length || select.closest(".custom-select")) return;
    select.dataset.customized = "true";
    const wrap = document.createElement("div");
    wrap.className = "custom-select";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const valueText = document.createElement("span");
    valueText.className = "custom-select-value";
    const arrow = document.createElement("span");
    arrow.className = "custom-select-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "⌄";
    trigger.append(valueText, arrow);
    const menu = document.createElement("div");
    menu.className = "custom-select-menu";
    menu.setAttribute("role", "listbox");
    const sync = () => {
      const option = select.options[select.selectedIndex];
      valueText.textContent = option ? option.textContent.trim() : "選択してください";
      trigger.disabled = select.disabled;
      trigger.classList.toggle("is-disabled", select.disabled);
      menu.querySelectorAll("[role=option]").forEach(button => {
        const selected = button.dataset.value === select.value;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-selected", selected ? "true" : "false");
      });
    };
    Array.from(select.options).forEach(option => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "custom-select-option";
      item.setAttribute("role", "option");
      item.dataset.value = option.value;
      item.textContent = option.textContent.trim();
      item.disabled = option.disabled;
      item.addEventListener("click", () => {
        if (select.disabled || option.disabled) return;
        const changed = select.value !== option.value;
        select.value = option.value;
        close();
        sync();
        if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
        trigger.focus();
      });
      menu.appendChild(item);
    });
    function close() {
      wrap.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    }
    trigger.addEventListener("click", () => {
      if (select.disabled) return;
      const opening = !wrap.classList.contains("open");
      document.querySelectorAll(".custom-select.open").forEach(el => {
        el.classList.remove("open");
        el.querySelector(".custom-select-trigger")?.setAttribute("aria-expanded", "false");
      });
      if (opening) {
        wrap.classList.add("open");
        trigger.setAttribute("aria-expanded", "true");
        menu.querySelector('[aria-selected="true"]')?.focus();
      }
    });
    trigger.addEventListener("keydown", event => {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        wrap.classList.add("open");
        trigger.setAttribute("aria-expanded", "true");
        menu.querySelector('[aria-selected="true"]')?.focus();
      } else if (event.key === "Escape") close();
    });
    menu.addEventListener("keydown", event => {
      const items = Array.from(menu.querySelectorAll(".custom-select-option:not(:disabled)"));
      const index = items.indexOf(document.activeElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
        items[next]?.focus();
      } else if (event.key === "Escape") {
        close(); trigger.focus();
      } else if (event.key === "Tab") close();
    });
    select.addEventListener("change", sync);
    select.addEventListener("blur", () => setTimeout(sync, 0));
    select.classList.add("custom-select-native");
    select.parentNode.insertBefore(wrap, select);
    wrap.append(trigger, menu, select);
    sync();
  }
  function enhanceAdminSelects(root = document) {
    root.querySelectorAll("select").forEach(enhanceAdminSelect);
  }
  document.addEventListener("click", event => {
    if (!event.target.closest(".custom-select")) {
      document.querySelectorAll(".custom-select.open").forEach(el => {
        el.classList.remove("open");
        el.querySelector(".custom-select-trigger")?.setAttribute("aria-expanded", "false");
      });
    }
  });
  const adminSelectObserver = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches?.("select")) enhanceAdminSelect(node);
      enhanceAdminSelects(node);
    }));
  });
  adminSelectObserver.observe(document.body, { childList: true, subtree: true });
  enhanceAdminSelects();

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

  const MAINTENANCE_TYPES = { normal:"通常メンテナンス", emergency:"緊急メンテナンス", other:"その他" };
  function maintenanceTypeLabel(value) { return MAINTENANCE_TYPES[value || $("maintenance-type")?.value] || MAINTENANCE_TYPES.normal; }
  async function loadMaintenance() {
    const {data,error}=await supabase.from("site_settings").select("maintenance_mode, maintenance_type, maintenance_reason").eq("id",true).maybeSingle();
    if(error) throw error;
    const enabled=!!data?.maintenance_mode, typeSelect=$("maintenance-type"), input=$("maintenance-reason"), toggle=$("maintenance-toggle"), status=$("maintenance-status");
    if(typeSelect){typeSelect.value=MAINTENANCE_TYPES[data?.maintenance_type]?data.maintenance_type:"normal";typeSelect.dataset.previousValue=typeSelect.value;}
    if(input){input.value=data?.maintenance_reason||"";input.dataset.savedValue=input.value;}
    if(toggle)toggle.checked=enabled;
    if(status)status.textContent=enabled?"現在オンです（"+maintenanceTypeLabel(data?.maintenance_type)+"）。一般ユーザーにはKizimin独自のメンテナンス画面が表示されます。":"現在オフです。選択中の種類："+maintenanceTypeLabel(data?.maintenance_type)+"。通常どおりサイトを利用できます。";
  }
  async function setMaintenanceType(type) {
    const select=$("maintenance-type"),status=$("maintenance-status");if(select)select.disabled=true;
    try{const {error}=await supabase.rpc("admin_set_maintenance_type",{p_type:type});if(error)throw error;if(status)status.textContent="種類を「"+maintenanceTypeLabel(type)+"」に変更しました。";}
    catch(e){if(select)select.value=select.dataset.previousValue||"normal";alert("メンテナンス種類の保存に失敗しました: "+errorMessage(e));}
    finally{if(select){select.disabled=false;select.dataset.previousValue=select.value;}}
  }
  async function saveMaintenanceReason() {
    const input=$("maintenance-reason"),button=$("maintenance-reason-save"),status=$("maintenance-status"),reason=input?.value.trim()||"";
    if(reason.length>1000){alert("理由は1000文字以内で入力してください。");return false;}
    if(button)button.disabled=true;
    try{const {error}=await supabase.rpc("admin_set_maintenance_reason",{p_reason:reason});if(error)throw error;if(input)input.dataset.savedValue=reason;if(button)button.textContent="保存済み";if(status)status.textContent=reason?"メンテナンス理由を保存しました。利用者向け画面に表示されます。":"理由を空欄で保存しました。利用者向け画面には標準の案内文が表示されます。";return true;}
    catch(e){alert("メンテナンス理由の保存に失敗しました: "+errorMessage(e));return false;}
    finally{if(button)button.disabled=false;}
  }
  async function setMaintenance(enabled) {
    const toggle=$("maintenance-toggle"),status=$("maintenance-status");
    if(enabled){const reason=$("maintenance-reason")?.value.trim()||"",saved=$("maintenance-reason")?.dataset.savedValue||"";if(!reason){if(toggle)toggle.checked=false;alert("メンテナンスを有効にする前に、利用者に表示する理由を入力してください。");return;}if(reason!==saved&&!(await saveMaintenanceReason())){if(toggle)toggle.checked=false;return;}}
    if(toggle)toggle.disabled=true;
    try{const {error}=await supabase.rpc("admin_set_maintenance_mode",{p_enabled:enabled});if(error)throw error;if(status)status.textContent=enabled?maintenanceTypeLabel()+"をオンにしました。利用者にはKizimin独自の案内画面が表示されます。":"メンテナンスモードをオフにしました。通常利用できます。";}
    catch(e){if(toggle)toggle.checked=!enabled;alert("メンテナンス設定の変更に失敗しました: "+errorMessage(e));}
    finally{if(toggle)toggle.disabled=false;}
  }

  async function loadDashboard() {
    const {data,error}=await supabase.rpc("admin_dashboard_stats");
    if(error) throw error;
    const stats=Array.isArray(data)?data[0]:data;
    renderDashboard(stats);
  }

  async function loadAccessDetails() {
    const container = $("access-details");
    const button = $("access-details-toggle");
    if (!container) return;
    container.hidden = false;
    container.innerHTML = '<p class="admin-muted">アクセス履歴を読み込んでいます...</p>';
    if (button) button.disabled = true;
    try {
      const { data, error } = await supabase.rpc("admin_access_log_details", { p_limit: 200 });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) {
        container.innerHTML = '<p class="admin-muted">アクセス履歴はまだありません。</p>';
        return;
      }
      container.innerHTML = '<div class="access-details-heading"><div><h3>アクセス履歴</h3><p class="admin-muted">最新200件・日本時間。IPアドレスは記録していません。</p></div><span class="access-details-count">' + rows.length + '件</span></div>' +
        '<div class="admin-table-wrap"><table class="admin-table access-details-table"><thead><tr><th>訪問日時</th><th>訪問者</th><th>ユーザーID</th><th>アクセス先</th></tr></thead><tbody>' +
        rows.map(row => '<tr><td>' + esc(date(row.visited_at)) + '</td><td>' +
          (row.user_id ? '<strong>' + esc(row.display_name || row.username || "名前未設定") + '</strong><small class="access-user-handle">' + esc(row.username ? "@" + row.username : "ログインユーザー") + '</small>' : '<span class="access-anonymous">匿名アクセス</span>') +
          '</td><td><code>' + esc(row.user_id || "記録なし") + '</code></td><td><code class="access-path">' + esc(row.path || "/") + '</code></td></tr>').join("") +
        '</tbody></table></div>';
    } catch (error) {
      console.error("アクセス詳細の読み込みに失敗しました。", error);
      container.innerHTML = '<div class="admin-alert">アクセス詳細を読み込めませんでした。権限またはデータベース設定を確認してください。</div>';
    } finally {
      if (button) button.disabled = false;
    }
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
    const { data: titleRows, error: titleError } = await supabase.from("profile_titles").select("user_id,title");
    if (titleError) console.warn("Official称号の読み込みに失敗しました:", titleError);
    const titleByUser = new Map((titleRows || []).map(row => [row.user_id, row.title]));
    const canManageRoles = currentAdminRole === "owner" || currentEffectivePermissions.has("manage_roles");
    const canBanUsers = currentAdminRole === "owner" || currentEffectivePermissions.has("ban_users");
    const canDeleteAccounts = currentAdminRole === "owner" || currentEffectivePermissions.has("delete_accounts");
    $("users-body").innerHTML = data.length ? data.map(u => {
      const isOfficial = titleByUser.get(u.id) === "Official";
      return `
      <tr>
        <td>${esc(u.username || u.id)}</td>
        <td>${esc(u.display_name || "-")}${isOfficial ? ' <span class="admin-badge" style="background:#111;color:#fff">Official</span>' : ''}</td>
        <td><span class="admin-badge">${u.id === "9589135e-4f75-4913-b13f-35407eeedf3b" ? "👑 オーナー" : esc(statusLabel(u.role))}</span></td>
        <td>
          <span class="admin-badge">${esc(statusLabel(u.account_status || "active"))}</span>
          ${u.ban_reason ? '<div class="admin-muted" style="margin-top:6px;white-space:pre-wrap">'+esc(u.ban_reason)+'</div>' : ''}
        </td>
        <td>${esc(date(u.created_at))}</td>
        <td class="admin-actions">
          ${canManageRoles && u.id !== "9589135e-4f75-4913-b13f-35407eeedf3b" && (currentAdminRole === "owner" || (u.id !== window.__kiziminCurrentUserId && ["user","moderator"].includes(u.role || "user"))) ? `<select class="user-role-select" data-id="${esc(u.id)}" data-current="${esc(u.role || "user")}" aria-label="ユーザー権限">${(currentAdminRole === "owner" ? ["user","moderator","admin","debugger"] : ["user","moderator"]).map(r => '<option value="'+r+'" '+(r===(u.role||"user")?"selected":"")+'>'+statusLabel(r)+'</option>').join("")}</select>` : `<span class="admin-muted">${esc(statusLabel(u.role || "user"))}</span>`}
          ${canBanUsers ? `<select class="account-status" data-id="${esc(u.id)}" data-current="${esc(u.account_status || "active")}" aria-label="アカウント状態" ${(u.id === "9589135e-4f75-4913-b13f-35407eeedf3b" || (u.role === "admin" && currentAdminRole !== "owner")) ? "disabled" : ""}>
            ${["active","banned","suspended"].map(s => '<option value="'+s+'" '+(s===(u.account_status||"active")?"selected":"")+'>'+statusLabel(s)+'</option>').join("")}
          </select>
          <label class="ban-expiry-field" style="${(u.account_status || "active") === "banned" ? "" : "display:none"}">
            <span class="admin-muted">BAN解除日時（JST）</span>
            <input class="ban-expires" data-id="${esc(u.id)}" type="datetime-local" step="1" value="${esc(jstDateTimeValue(u.ban_expires_at))}" aria-label="BAN解除日時（JST）">
          </label>
          <button type="button" class="account-status-save" data-id="${esc(u.id)}">状態を保存</button>` : ""}
          ${u.id !== "9589135e-4f75-4913-b13f-35407eeedf3b" && ["admin","moderator","owner"].includes(currentAdminRole) ? `<button type="button" class="user-identity-edit" data-id="${esc(u.id)}" data-username="${esc(u.username || "")}" data-display-name="${esc(u.display_name || "")}">名前を変更</button>` : ""}
          ${currentAdminRole === "owner" && u.id !== "9589135e-4f75-4913-b13f-35407eeedf3b" ? `<button type="button" class="user-official-toggle" data-id="${esc(u.id)}" data-enabled="${isOfficial ? "true" : "false"}">${isOfficial ? "Official解除" : "Official付与"}</button>` : ""}
          ${canDeleteAccounts && u.id !== "9589135e-4f75-4913-b13f-35407eeedf3b" && (u.role !== "admin" || currentAdminRole === "owner") ? `<button type="button" class="user-delete" data-id="${esc(u.id)}" data-name="${esc(u.display_name || u.username || u.id)}">強制削除</button>` : ""}
        </td>
      </tr>`}).join("") : '<tr><td colspan="6">ユーザーはいません。</td></tr>';
    window.KiziminUserTools?.refresh?.();
    document.querySelectorAll(".user-role-select").forEach(s => s.onchange = () => changeRole(s.dataset.id, s.dataset.current, s.value, s));
    document.querySelectorAll(".account-status").forEach(select => {
      select.addEventListener("change", () => {
        const field = document.querySelector('.ban-expiry-field input.ban-expires[data-id="' + CSS.escape(select.dataset.id) + '"]')?.closest(".ban-expiry-field");
        if (field) field.style.display = select.value === "banned" ? "" : "none";
      });
    });
    document.querySelectorAll(".account-status-save").forEach(b => b.onclick = () => saveAccountStatus(b.dataset.id));
    document.querySelectorAll(".user-identity-edit").forEach(b => b.onclick = () => editUserIdentity(b));
    document.querySelectorAll(".user-official-toggle").forEach(b => b.onclick = () => toggleOfficial(b));
    document.querySelectorAll(".user-delete").forEach(b => b.onclick = () => forceDeleteUser(b.dataset.id, b.dataset.name));
  }

  async function editUserIdentity(button) {
    const id = button.dataset.id;
    const currentUsername = button.dataset.username || "";
    const currentDisplayName = button.dataset.displayName || "";
    const username = prompt("新しいユーザー名（3〜30文字、半角英数字と _ のみ）", currentUsername);
    if (username === null) return;
    const displayName = prompt("新しい表示名（1〜60文字）", currentDisplayName);
    if (displayName === null) return;
    if (!/^[A-Za-z0-9_]{3,30}$/.test(username.trim())) {
      alert("ユーザー名は3〜30文字の半角英数字と _ で入力してください。");
      return;
    }
    if (!displayName.trim() || displayName.trim().length > 60) {
      alert("表示名は1〜60文字で入力してください。");
      return;
    }
    if (!confirm("ユーザー名と表示名を変更しますか？\n\nユーザー名: " + username.trim() + "\n表示名: " + displayName.trim())) return;
    button.disabled = true;
    try {
      const { data, error } = await supabase.rpc("admin_update_profile_identity", {
        p_target_id: id,
        p_username: username.trim(),
        p_display_name: displayName.trim()
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || "更新できませんでした");
      alert("ユーザー名と表示名を更新しました。");
      await loadUsers();
    } catch (e) {
      console.error("ユーザー名・表示名の更新失敗", e);
      const msg = String(e?.message || "");
      alert(/USERNAME_TAKEN|duplicate key/i.test(msg) ? "そのユーザー名は既に使用されています。" :
        /INVALID_USERNAME/i.test(msg) ? "ユーザー名の形式が正しくありません。" :
        /INVALID_DISPLAY_NAME/i.test(msg) ? "表示名の形式が正しくありません。" :
        /OWNER_TARGET_PROTECTED/i.test(msg) ? "オーナーのプロフィールはこの操作では変更できません。" :
        "ユーザー名・表示名を更新できませんでした。権限または通信状態を確認してください。");
    } finally {
      button.disabled = false;
    }
  }

  async function toggleOfficial(button) {
    if (currentAdminRole !== "owner") {
      alert("Official称号を付与できるのはオーナーだけです。");
      return;
    }
    const id = button.dataset.id;
    const enabled = button.dataset.enabled !== "true";
    const label = enabled ? "Official称号を付与" : "Official称号を解除";
    if (!confirm("このユーザーに" + label + "しますか？")) return;
    button.disabled = true;
    try {
      const { data, error } = await supabase.rpc("owner_set_official_title", {
        p_target_id: id,
        p_enabled: enabled
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || "更新できませんでした");
      await loadUsers();
    } catch (e) {
      console.error("Official称号の更新失敗", e);
      alert("Official称号を変更できませんでした。オーナー権限とSupabase側の設定を確認してください。");
    } finally {
      button.disabled = false;
    }
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

      const { error } = await supabase.rpc("admin_set_account_status", {
        p_target_id: id,
        p_status: status,
        p_reason: reason.trim(),
        p_expires_at: expiresAt
      });
      if (error) {
        alert("アカウント状態の変更に失敗しました: " + errorMessage(error));
        await loadUsers();
        return;
      }
    } else {
      if (!confirm("このアカウントの利用制限を解除しますか？")) return;
      const { error } = await supabase.rpc("admin_set_account_status", {
        p_target_id: id,
        p_status: "active",
        p_reason: null,
        p_expires_at: null
      });
      if (error) {
        alert("アカウント状態の変更に失敗しました: " + errorMessage(error));
        await loadUsers();
        return;
      }
    }
    await loadUsers();
  }

  async function changeRole(id, current, next, selectEl) {
    if (!["admin","owner"].includes(currentAdminRole)) {
      if (selectEl) selectEl.value = current;
      alert("権限の変更は管理者のみ実行できます。");
      return;
    }
    if (currentAdminRole !== "owner" && (id === window.__kiziminCurrentUserId || !["user","moderator"].includes(current) || !["user","moderator"].includes(next))) {
      if (selectEl) selectEl.value = current;
      alert("管理者は自分自身の権限や、管理者以上の権限を変更できません。変更できるのは一般ユーザーとモデレーターのみです。");
      return;
    }
    if (!["user","moderator","admin"].includes(next)) {
      if (selectEl) selectEl.value = current;
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id;
    if (currentUserId === id && current === "admin" && next !== "admin") {
      if (selectEl) selectEl.value = current;
      alert("自分自身の管理者権限は、この画面から解除できません。");
      return;
    }
    if (current === next) return;
    if (!confirm("このユーザーの権限を「" + statusLabel(current) + "」から「" + statusLabel(next) + "」に変更しますか？")) {
      if (selectEl) selectEl.value = current;
      return;
    }
    if (selectEl) selectEl.disabled = true;
    try {
      const { error } = await supabase.rpc("admin_change_profile_role", {
        p_target_id: id,
        p_new_role: next
      });
      if (error) throw error;
      await loadUsers();
      try {
        const { data } = await supabase.rpc("admin_access_check");
        renderAudit((Array.isArray(data) ? data[0] : data)?.recent_role_changes || []);
      } catch (e) {
        console.warn("権限監査の再取得に失敗", e);
      }
    } catch (error) {
      if (selectEl) selectEl.value = current;
      alert("権限変更に失敗しました: " + errorMessage(error));
    } finally {
      if (selectEl) selectEl.disabled = false;
    }
  }

  async function loadArticles() {
    const body = $("articles-body");
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5"><div class="admin-muted">記事を読み込んでいます...</div></td></tr>';
    try {
      const { data, error } = await supabase.from("articles")
        .select("id,title,status,created_at,author_id,is_pinned")
        .order("is_pinned", { ascending:false })
        .order("created_at", { ascending:false });
      if (error) throw error;
      const rows = data || [];
      const authorIds = [...new Set(rows.map(a => a.author_id).filter(Boolean))];
      const { data: profiles, error: profilesError } = authorIds.length
        ? await supabase.from("profiles").select("id,display_name,username").in("id", authorIds)
        : { data:[], error:null };
      if (profilesError) throw profilesError;
      const authors = new Map((profiles || []).map(p => [p.id, p]));
      body.innerHTML = rows.length ? rows.map(a => {
        const author = authors.get(a.author_id);
        return `
        <tr>
          <td>${esc(a.title)} ${a.is_pinned ? '<span class="admin-badge">📌 ホーム固定中</span>' : ''}</td>
          <td>${esc(author?.display_name || author?.username || "-")}</td>
          <td><span class="admin-badge">${esc(statusLabel(a.status))}</span></td>
          <td>${esc(date(a.created_at))}</td>
          <td>
            <select class="article-status" data-id="${esc(a.id)}" aria-label="記事状態">
              ${["draft","published","archived"].map(s => `<option value="${s}" ${s===a.status?"selected":""}>${statusLabel(s)}</option>`).join("")}
            </select>
            ${["admin","owner"].includes(currentAdminRole) ? `<button type="button" class="article-pin admin-btn" data-id="${esc(a.id)}" data-pinned="${a.is_pinned ? "true" : "false"}">${a.is_pinned ? "固定を解除" : "ホーム上部に固定"}</button>` : '<span class="admin-muted">固定操作は管理者のみ</span>'}
            ${["admin","owner"].includes(currentAdminRole) ? `<button type="button" class="article-delete admin-btn danger" data-id="${esc(a.id)}" data-title="${esc(a.title)}">記事を削除</button>` : ""}
          </td>
        </tr>`;
      }).join("") : '<tr><td colspan="5">記事はありません。</td></tr>';
      document.querySelectorAll(".article-status").forEach(s => {
        s.onchange = () => updateArticle(s.dataset.id, s.value, s);
      });
      document.querySelectorAll(".article-pin").forEach(b => {
        b.onclick = () => updateArticlePin(b.dataset.id, b.dataset.pinned === "true", b);
      });
      document.querySelectorAll(".article-delete").forEach(b => { b.onclick = () => deleteArticle(b.dataset.id, b.dataset.title, b); });
    } catch (error) {
      console.error("記事一覧の読み込みに失敗しました:", error);
      body.innerHTML = '<tr><td colspan="5"><div class="admin-alert">記事を読み込めませんでした。権限または通信状態を確認してください。</div></td></tr>';
    }
  }


  async function deleteArticle(id, title, button) {
    if (!["admin","owner"].includes(currentAdminRole)) { alert("記事を削除できるのは管理者またはオーナーのみです。"); return; }
    if (!confirm("記事「" + title + "」を完全に削除しますか？\n\n記事に紐づくコメント、通報、いいね、保存情報も削除されます。この操作は元に戻せません。")) return;
    button.disabled = true; button.textContent = "削除中…";
    try {
      const result = await secureContent("article_delete", { article_id: id });
      if (!result?.ok) throw new Error(result?.error || "記事を削除できませんでした。");
      await loadArticles(); await loadDashboard(); alert("記事を削除しました。");
    } catch (error) {
      console.error("記事削除失敗", error); alert("記事を削除できませんでした: " + errorMessage(error));
      button.disabled = false; button.textContent = "記事を削除";
    }
  }

  async function updateArticlePin(id, currentlyPinned, button) {
    if (!["admin","owner"].includes(currentAdminRole)) {
      alert("ホーム固定を変更できるのは管理者のみです。");
      return;
    }
    if (!confirm(currentlyPinned ? "この記事のホーム固定を解除しますか？" : "この記事を全ユーザーのホーム上部に固定しますか？")) return;
    button.disabled = true;
    try {
      const { data, error } = await supabase.from("articles")
        .update({ is_pinned: !currentlyPinned })
        .eq("id", id)
        .select("id,is_pinned")
        .single();
      if (error) throw error;
      if (!data) throw new Error("記事の固定状態を更新できませんでした。");
      await loadArticles();
    } catch (error) {
      console.error("記事固定の変更に失敗しました:", error);
      alert("ホーム固定を変更できませんでした: " + (error?.message || "権限または通信状態を確認してください。"));
      button.disabled = false;
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
      $("comments-body").innerHTML = rows.length ? rows.map(c => '<tr><td class="admin-log">' + esc(c.content) + '</td><td>' + esc(c.profiles?.display_name || c.profiles?.username || "-") + '</td><td><span class="admin-badge">' + esc(statusLabel(c.status)) + '</span></td><td>' + esc(date(c.created_at)) + '</td><td><select class="comment-status" data-id="' + esc(c.id) + '">' + ["visible","hidden","deleted"].map(x => '<option value="' + x + '" ' + (x===c.status?"selected":"") + '>' + statusLabel(x) + '</option>').join("") + '</select> <button type="button" class="comment-delete admin-btn danger" data-id="' + esc(c.id) + '" data-content="' + esc(String(c.content || "").slice(0,80)) + '">完全削除</button></td></tr>').join("") : '<tr><td colspan="5">コメントはありません。</td></tr>';
      document.querySelectorAll(".comment-status").forEach(s => s.onchange = () => updateComment(s.dataset.id,s.value));
      document.querySelectorAll(".comment-delete").forEach(b => b.onclick = () => deleteComment(b.dataset.id, b.dataset.content, b));
    } catch (e) {
      console.error("コメント一覧の読み込みに失敗しました:", e);
      const body = $("comments-body");
      if (body) body.innerHTML = '<tr><td colspan="5"><div class="admin-alert">コメントを読み込めませんでした。' + esc(errorMessage(e)) + '</div></td></tr>';
    }
  }
  async function updateComment(id,status) {
    try {
      const result = await secureContent("comment_status",{comment_id:id,status});
      if (!result?.ok) throw new Error(result?.error || "状態を更新できませんでした。");
      await loadComments();
    } catch (error) { alert("コメント状態の変更に失敗しました: " + errorMessage(error)); await loadComments(); }
  }

  async function deleteComment(id, content, button) {
    if (!["admin","moderator","owner"].includes(currentAdminRole)) { alert("コメントを削除する権限がありません。"); return; }
    if (!confirm("このコメントを完全に削除しますか？\n\n" + (content || "(内容なし)") + "\n\n返信コメントや関連する通報も削除される場合があります。この操作は元に戻せません。")) return;
    button.disabled = true; button.textContent = "削除中…";
    try {
      const result = await secureContent("comment_delete", { comment_id: id });
      if (!result?.ok) throw new Error(result?.error || "コメントを削除できませんでした。");
      await loadComments(); await loadDashboard();
    } catch (error) {
      console.error("コメント削除失敗", error); alert("コメントを削除できませんでした: " + errorMessage(error));
      button.disabled = false; button.textContent = "完全削除";
    }
  }

  async function loadInquiries() {
    const { data, error } = await supabase.from("inquiries")
      .select("id,user_id,name,email,subject,message,status,admin_note,created_at,resolved_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    $("inquiries-body").innerHTML = data.length ? data.map(i => '<tr>' +
      '<td>' + esc(i.subject) + '</td>' +
      '<td>' + esc(i.name || "-") + '<br>' + esc(i.email || "-") + '<div class="admin-muted">返信先: ' + esc(i.user_id ? "サイト内通知" : (i.email ? "メール未対応" : "返信先なし")) + '</div></td>' +
      '<td class="inquiry-message">' + esc(i.message) + '</td>' +
      '<td><select class="inquiry-status" data-id="' + esc(i.id) + '">' + ["open","reviewing","resolved","closed","dismissed"].map(s => '<option value="' + s + '" ' + (s === i.status ? "selected" : "") + '>' + statusLabel(s) + '</option>').join("") + '</select><br>' +
      '<textarea class="inquiry-note" data-id="' + esc(i.id) + '" placeholder="管理者メモ">' + esc(i.admin_note || "") + '</textarea><br>' +
      '<button type="button" class="inquiry-save admin-btn" data-id="' + esc(i.id) + '">状態・メモを保存</button>' +
      '<textarea class="inquiry-reply" data-id="' + esc(i.id) + '" maxlength="4000" placeholder="問い合わせ本人への返信（サイト内通知）"></textarea>' +
      '<button type="button" class="inquiry-reply-send admin-btn primary" data-id="' + esc(i.id) + '" ' + (!i.user_id ? 'disabled title="ログインユーザーとの紐付けがない問い合わせには返信できません"' : '') + '>返信を送信</button></td>' +
      '<td>' + esc(date(i.created_at)) + '</td></tr>').join("") : '<tr><td colspan="5">問い合わせはありません。</td></tr>';
    document.querySelectorAll(".inquiry-save").forEach(b => b.onclick = () => saveInquiry(b.dataset.id));
    document.querySelectorAll(".inquiry-reply-send").forEach(b => b.onclick = () => sendCaseReply("inquiry", b.dataset.id));
  }
  async function saveInquiry(id) {
    const status = document.querySelector('.inquiry-status[data-id="' + CSS.escape(id) + '"]').value;
    const note = document.querySelector('.inquiry-note[data-id="' + CSS.escape(id) + '"]').value;
    const button = document.querySelector('.inquiry-save[data-id="' + CSS.escape(id) + '"]');
    if (button) { button.disabled = true; button.textContent = "保存中..."; }
    try {
      const { data, error } = await supabase.rpc("admin_update_inquiry_by_id", {
        p_inquiry_id: Number(id), p_status: status, p_admin_note: note
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || "保存できませんでした。");
      if (button) button.textContent = "保存しました";
      // 保存成功後の一覧再読み込み失敗を、保存そのものの失敗と誤表示しない。
      try {
        await loadInquiries();
        await loadDashboard();
      } catch (refreshError) {
        console.error("問い合わせ保存後の再読み込みに失敗:", refreshError);
        if (button) {
          button.disabled = false;
          button.textContent = "保存済み（再読み込み失敗）";
        }
        alert("問い合わせは保存されましたが、一覧の更新に失敗しました。ページを更新して確認してください。");
      }
    } catch (error) {
      console.error("問い合わせの状態・メモ保存に失敗:", error);
      const raw = String(error?.message || error || "");
      const message = /AUTHENTICATION_REQUIRED|ACTIVE_ACCOUNT_REQUIRED|STAFF_REQUIRED|INQUIRY_PERMISSION_REQUIRED|permission denied|row-level security/i.test(raw)
        ? "管理権限を確認できませんでした。再ログインして権限を確認してください。"
        : /INQUIRY_NOT_FOUND/i.test(raw) ? "対象の問い合わせが見つかりません。"
        : /INVALID_INQUIRY_UPDATE|NOTE_TOO_LONG/i.test(raw) ? "状態またはメモの内容を確認してください。"
        : "保存処理に失敗しました。時間をおいて再試行してください。";
      alert("問い合わせの更新に失敗しました: " + message);
      if (button) { button.disabled = false; button.textContent = "状態・メモを保存"; }
    }
  }

  async function sendCaseReply(kind, id) {
    const fieldClass = kind === "inquiry" ? ".inquiry-reply" : ".report-reply";
    const buttonClass = kind === "inquiry" ? ".inquiry-reply-send" : ".report-reply-send";
    const field = document.querySelector(fieldClass + '[data-id="' + CSS.escape(id) + '"]');
    const button = document.querySelector(buttonClass + '[data-id="' + CSS.escape(id) + '"]');
    const message = field?.value.trim() || "";
    if (!message) { alert("返信内容を入力してください。"); return; }
    if (!confirm("返信をサイト内通知として本人に送信しますか？")) return;
    if (button) button.disabled = true;
    try {
      await secureContent("admin_case_reply", { case_type: kind, case_id: id, reply: message });
      if (field) field.value = "";
      alert("返信をサイト内通知で送信しました。");
    } catch (error) {
      alert("返信を送信できませんでした: " + errorMessage(error));
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function loadReports() {
    const { data, error } = await supabase.from("reports")
      .select("id,article_id,comment_id,reporter_id,reason,status,admin_note,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    const articleIds = [...new Set((data || []).map(r => r.article_id).filter(Boolean))];
    const articleNames = new Map();
    if (articleIds.length) {
      const { data: articleRows, error: articleError } = await supabase.from("articles").select("id,title").in("id", articleIds);
      if (articleError) console.warn("通報対象の記事名を取得できませんでした:", articleError);
      for (const row of articleRows || []) articleNames.set(row.id, row.title);
    }
    $("reports-body").innerHTML = data.length ? data.map(r => `
      <tr><td>${esc(r.article_id ? "記事: " + (articleNames.get(r.article_id) || "削除済みの記事") : "コメント: " + r.comment_id)}</td><td class="admin-log">${esc(r.reason)}</td><td><span class="admin-badge">${esc(statusLabel(r.status))}</span></td><td>${esc(date(r.created_at))}</td>
      <td><select class="report-status" data-id="${esc(r.id)}">${["open","reviewing","resolved","dismissed"].map(s => `<option value="${s}" ${s === r.status ? "selected" : ""}>${statusLabel(s)}</option>`).join("")}</select><br>
      <textarea class="report-note" data-id="${esc(r.id)}" placeholder="管理者メモ">${esc(r.admin_note || "")}</textarea><br><button type="button" class="report-save admin-btn" data-id="${esc(r.id)}">状態・メモを保存</button>
      <textarea class="report-reply" data-id="${esc(r.id)}" maxlength="4000" placeholder="通報した本人への返信（サイト内通知）"></textarea>
      <button type="button" class="report-reply-send admin-btn primary" data-id="${esc(r.id)}" ${(!r.reporter_id ? 'disabled title="通報者が特定できないため返信できません"' : "")}>返信を送信</button></td></tr>`).join("") : '<tr><td colspan="5">通報はありません。</td></tr>';
    document.querySelectorAll(".report-save").forEach(b => b.onclick = () => saveReport(b.dataset.id));
    document.querySelectorAll(".report-reply-send").forEach(b => b.onclick = () => sendCaseReply("report", b.dataset.id));
  }
  async function saveReport(id) {
    const status = document.querySelector('.report-status[data-id="' + CSS.escape(id) + '"]').value;
    const note = document.querySelector('.report-note[data-id="' + CSS.escape(id) + '"]').value;
    const { error } = await supabase.from("reports").update({
      status, admin_note: note,
      resolved_at: status === "resolved" || status === "dismissed" ? new Date().toISOString() : null
    }).eq("id", id);
    if (error) { alert("通報の更新に失敗しました: " + errorMessage(error)); return; }
    await loadReports();
  }

  async function secureContent(action, extra = {}) {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.expires_at || session.expires_at * 1000 < Date.now() + 30000) {
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && data?.session) session = data.session;
    }
    if (!session?.access_token) {
      throw new Error("ログインセッションが切れています。再ログインしてください。");
    }
    const { data, error } = await supabase.functions.invoke("secure-content", {
      body: { action, ...extra },
      headers: {
        Authorization: "Bearer " + session.access_token,
        apikey: SUPABASE_PUBLISHABLE_KEY
      }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
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

  function updateBroadcastPreview() {
    const title = $("broadcast-title")?.value.trim() || "";
    const body = $("broadcast-body")?.value || "";
    const link = $("broadcast-link")?.value.trim() || "";
    if ($("broadcast-preview-title")) $("broadcast-preview-title").textContent = title || "タイトル未入力";
    if ($("broadcast-preview-body")) $("broadcast-preview-body").textContent = body || "本文がここに表示されます。";
    if ($("broadcast-preview-link")) $("broadcast-preview-link").textContent = link ? "リンク: " + link : "リンクなし";
    if ($("broadcast-length")) $("broadcast-length").textContent = "本文 " + body.length + " / 5000文字";
  }

  async function broadcastNotification() {
    const title = $("broadcast-title")?.value.trim();
    const body = $("broadcast-body")?.value.trim() || "";
    const rawLink = $("broadcast-link")?.value.trim() || "";
    const result = $("broadcast-result");
    const button = $("broadcast-send");
    if (!title) { alert("通知タイトルを入力してください。"); $("broadcast-title")?.focus(); return; }
    if (!body) { alert("通知本文を入力してください。"); $("broadcast-body")?.focus(); return; }
    let link = rawLink || null;
    if (link) {
      try {
        const parsed = new URL(link, window.location.href);
        if (parsed.protocol !== "https:" || /^(?:javascript|data|vbscript):/i.test(link) || link.startsWith("//")) {
          throw new Error("INVALID_LINK");
        }
      } catch {
        alert("リンクはサイト内の相対パス、またはHTTPSのURLを入力してください。");
        $("broadcast-link")?.focus();
        return;
      }
    }
    const confirmed = confirm("全ユーザー向け通知を送信します。\n\nタイトル: " + title + "\n本文: " + body.slice(0, 500) + (body.length > 500 ? "…" : "") + "\nリンク: " + (link || "なし") + "\n\n送信先: 全ユーザー\n送信方法: サイト内通知（メールは送信しません）\n\nこの内容で送信しますか？");
    if (!confirmed) return;
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
      updateBroadcastPreview();
      await loadNotificationHistory().catch(e => console.warn("通知履歴を更新できませんでした", e));
    } catch (e) {
      result.textContent = "";
      alert("通知の送信に失敗しました: " + errorMessage(e));
    } finally {
      button.disabled = false;
    }
  }


  const permissionMeta = [
    ["write_content","記事・コメントの投稿"],
    ["moderate_comments","コメントの管理"],
    ["ban_users","ユーザーのBAN・利用制限"],
    ["delete_accounts","アカウントの削除"],
    ["manage_roles","ユーザー権限の変更"],
    ["manage_settings","サイト設定の変更"],
    ["view_logs","監査ログの閲覧"],
    ["manage_reports","通報の管理"],
    ["broadcast_notifications","全員への通知送信"],
    ["manage_inquiries","問い合わせの管理"]
  ];
  const rolePermissionMeta = permissionMeta.filter(([key]) => key !== "manage_inquiries");
  async function loadPermissions() {
    const notice = $("permissions-notice");
    const grid = $("permissions-grid");
    if (currentAdminRole !== "owner") {
      if (notice) notice.textContent = "権限設定を表示・変更できるのはサイトオーナーのみです。";
      if (grid) grid.innerHTML = "";
      return;
    }
    if (notice) notice.textContent = "読み込み中...";
    const {data,error} = await supabase.rpc("admin_get_role_permissions");
    if (error) throw error;
    const values = new Map((data || []).map(row => [row.role + ":" + row.permission_key, !!row.allowed]));
    grid.innerHTML = '<table class="admin-table"><thead><tr><th>権限</th><th>user</th><th>moderator</th><th>admin</th><th>owner</th><th>デバッカー</th></tr></thead><tbody>' +
      rolePermissionMeta.map(([key,label]) => '<tr><td>' + esc(label) + '</td>' +
        ["user","moderator","admin","owner","debugger"].map(role => {
          if (currentAdminRole !== "owner" && (role === "admin" || role === "owner")) {
            return '<td><span class="admin-muted">オーナー専用</span></td>';
          }
          const locked = role === "owner";
          const checked = values.get(role + ":" + key) === true;
          return '<td><label style="display:flex;justify-content:center;align-items:center;gap:7px"><input type="checkbox" class="role-permission-toggle" data-role="' + role + '" data-permission="' + key + '" ' + (checked ? "checked" : "") + (locked ? " disabled" : "") + ' aria-label="' + role + ' ' + esc(label) + '">' + (locked ? '<span class="admin-muted">固定</span>' : '') + '</label></td>';
        }).join("") + '</tr>').join("") + '</tbody></table>';
    if (notice) notice.textContent = "オーナー専用設定です。adminを含む各ロールの権限を変更できます。owner自身の権限は固定されています.";
    grid.querySelectorAll(".role-permission-toggle").forEach(input => {
      input.addEventListener("change", async () => {
        if (currentAdminRole !== "owner") {
          input.checked = !input.checked;
          alert("権限設定を変更できるのはサイトオーナーのみです。");
          return;
        }
        const permissionLabel = rolePermissionMeta.find(x => x[0] === input.dataset.permission)?.[1] || input.dataset.permission;
        const previousAllowed = !input.checked;
        const nextState = input.checked ? "許可する" : "禁止する";
        if (!confirm("権限変更を実行しますか？\n\n対象ロール: " + input.dataset.role + "\n権限: " + permissionLabel + "\n変更: " + (previousAllowed ? "許可" : "禁止") + " → " + (input.checked ? "許可" : "禁止") + "\n\nサイトオーナーとして変更を確定します。")) {
          input.checked = previousAllowed;
          return;
        }
        input.disabled = true;
        const {error:saveError} = await supabase.rpc("admin_set_role_permission", {
          p_role: input.dataset.role,
          p_permission_key: input.dataset.permission,
          p_allowed: input.checked
        });
        if (saveError) {
          input.checked = !input.checked;
          alert("権限設定を保存できませんでした: " + errorMessage(saveError));
        } else if (notice) {
          notice.textContent = input.dataset.role + " / " + (rolePermissionMeta.find(x => x[0] === input.dataset.permission)?.[1] || input.dataset.permission) + " を保存しました。";
        }
        input.disabled = false;
      });
    });
    await loadUserPermissionOverrides();
  }

  async function loadUserPermissionOverrides() {
    const target = $("user-permission-target");
    const notice = $("user-permission-notice");
    const grid = $("user-permission-grid");
    if (!target || !grid) return;
    if (currentAdminRole !== "owner") {
      if (notice) notice.textContent = "ユーザー別権限を変更できるのはサイトオーナーのみです。";
      grid.innerHTML = "";
      return;
    }
    if (notice) notice.textContent = "ユーザー一覧を読み込んでいます...";
    const {data: targets, error: targetError} = await supabase.rpc("admin_list_permission_targets");
    if (targetError) throw targetError;
    const selectedId = target.value;
    target.innerHTML = '<option value="">ユーザーを選択してください</option>' +
      (targets || []).map(user => '<option value="' + esc(user.user_id) + '">' +
        esc(user.display_name || user.username || "名前未設定") + '（@' + esc(user.username || "unknown") +
        '・' + esc(user.role) + '）</option>').join("");
    if ((targets || []).some(user => user.user_id === selectedId)) target.value = selectedId;
    target.onchange = () => loadSelectedUserPermissions().catch(error => {
      console.error("ユーザー別権限の読み込み失敗", error);
      if (notice) notice.textContent = "権限を読み込めませんでした。";
      grid.innerHTML = '<div class="admin-alert">ユーザー別権限を読み込めませんでした。</div>';
    });
    grid.onchange = async event => {
      const input = event.target.closest(".user-permission-value");
      if (!input || !target.value) return;
      const previous = input.dataset.previous || "inherit";
      const next = input.value;
      const label = permissionMeta.find(item => item[0] === input.dataset.permission)?.[1] || input.dataset.permission;
      const meaning = value => value === "inherit" ? "ロール設定を継承" : value === "allow" ? "個別に許可" : "個別に禁止";
      if (!confirm("ユーザー別の権限を変更しますか？\n\n対象: " + target.selectedOptions[0]?.textContent +
          "\n権限: " + label + "\n変更: " + meaning(previous) + " → " + meaning(next))) {
        input.value = previous;
        return;
      }
      input.disabled = true;
      if (notice) notice.textContent = "保存しています...";
      const {error} = await supabase.rpc("admin_set_user_permission", {
        p_target_id: target.value,
        p_permission_key: input.dataset.permission,
        p_value: next
      });
      if (error) {
        input.value = previous;
        input.disabled = false;
        if (notice) notice.textContent = "保存できませんでした: " + errorMessage(error);
        return;
      }
      if (notice) notice.textContent = "個別権限を保存しました。";
      await loadSelectedUserPermissions();
    };

    async function loadSelectedUserPermissions() {
      const userId = target.value;
      if (!userId) {
        grid.innerHTML = '<div class="admin-muted user-permission-empty">ユーザーを選択すると、個別権限を設定できます。</div>';
        if (notice) notice.textContent = "対象ユーザーを選択してください。";
        return;
      }
      if (notice) notice.textContent = "個別権限を読み込んでいます...";
      const {data, error} = await supabase.rpc("admin_get_user_permission_overrides", {p_target_id:userId});
      if (error) throw error;
      const values = new Map((data || []).map(row => [row.permission_key,row]));
      grid.innerHTML = '<div class="admin-table-wrap"><table class="admin-table user-permission-table"><thead><tr><th>機能</th><th>このユーザーの設定</th><th>現在の実効権限</th></tr></thead><tbody>' +
        permissionMeta.map(([key,label]) => {
          const row = values.get(key) || {};
          const value = row.allowed === null || row.allowed === undefined ? "inherit" : row.allowed ? "allow" : "deny";
          const effective = row.effective_allowed === true;
          const source = value === "inherit" ? "ロール設定から継承" : "ユーザー個別設定";
          return '<tr><td><strong>' + esc(label) + '</strong></td><td><select class="user-permission-value" data-permission="' + esc(key) + '" data-previous="' + value + '">' +
            '<option value="inherit"' + (value==="inherit"?" selected":"") + '>ロール設定を継承</option>' +
            '<option value="allow"' + (value==="allow"?" selected":"") + '>このユーザーに許可</option>' +
            '<option value="deny"' + (value==="deny"?" selected":"") + '>このユーザーは禁止</option>' +
            '</select></td><td><span class="user-permission-effective ' + (effective?"is-allowed":"is-denied") + '">' +
            (effective?"許可":"禁止") + '</span><small class="user-permission-source">' + esc(source) + '</small></td></tr>';
        }).join("") + '</tbody></table></div>';
      if (notice) notice.textContent = "個別設定はロール設定より優先されます。「ロール設定を継承」に戻すと、そのユーザーの個別設定だけを解除します。";
    }
    await loadSelectedUserPermissions();
  }

  const viewMeta = {
    dashboard: ["ダッシュボード","Kiziminの状態をまとめて確認します。"],
    users: ["ユーザー管理","権限とアカウント状態を管理します。"],
    articles: ["記事管理","記事の公開状態を管理します。"],
    comments: ["コメント管理","コメントの表示状態を管理します。"],
    reports: ["通報管理","届いた通報を確認して対応します。"],
    inquiries: ["問い合わせ管理","問い合わせの対応状況を管理します。"],
    notifications: ["通知送信","管理者から全ユーザーへサイト内通知を送信し、送信履歴と実行者を確認します。"],
    permissions: ["権限設定","ロールごとに機能の許可・禁止を設定します。"],
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
        const loaders = {dashboard: loadDashboard, users: loadUsers, articles: loadArticles, comments: loadComments, reports: loadReports, inquiries: loadInquiries, notifications: loadNotificationHistory, permissions: loadPermissions};
        const loader = loaders[key];
        if (loader) loader().catch(e => {
          console.error("管理セクション読み込みエラー", key, e);
          const body = document.querySelector("#view-" + key + " tbody");
          if (body) body.innerHTML = '<tr><td colspan="10"><div class="admin-alert">データを読み込めませんでした。'+esc(errorMessage(e))+'</div></td></tr>';
        });
      });
    });

    $("access-details-toggle")?.addEventListener("click", () => {
      const panel = $("access-details");
      if (panel && !panel.hidden) { panel.hidden = true; return; }
      loadAccessDetails();
    });
    $("broadcast-send")?.addEventListener("click", broadcastNotification);
    ["broadcast-title", "broadcast-body", "broadcast-link"].forEach(id => {
      $(id)?.addEventListener("input", updateBroadcastPreview);
    });
    updateBroadcastPreview();

    $("maintenance-toggle")?.addEventListener("change", e => {
      const enabled=e.target.checked;
      if(!confirm(enabled?maintenanceTypeLabel()+"を有効にしますか？利用者には設定した理由とKizimin独自のメンテナンス画面が表示されます。":"メンテナンスモードをオフにしますか？")){e.target.checked=!enabled;return;}
      setMaintenance(enabled);
    });
    const maintenanceTypeSelect=$("maintenance-type");
    if(maintenanceTypeSelect){maintenanceTypeSelect.dataset.previousValue=maintenanceTypeSelect.value;maintenanceTypeSelect.addEventListener("change",e=>{const next=e.target.value;if(!confirm("メンテナンスの種類を「"+maintenanceTypeLabel(next)+"」に変更しますか？")){e.target.value=e.target.dataset.previousValue||"normal";return;}setMaintenanceType(next);});}
    $("maintenance-reason-save")?.addEventListener("click",saveMaintenanceReason);
    $("maintenance-reason")?.addEventListener("input",e=>{const button=$("maintenance-reason-save");if(button)button.textContent=e.target.value===e.target.dataset.savedValue?"理由を保存":"変更を保存";});

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
    const requested = viewMeta[hash] ? hash : "dashboard";
    const button = document.querySelector('.admin-nav [data-view="' + requested + '"]:not(.hidden)')
      || document.querySelector('.admin-nav [data-view]:not(.hidden)');
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
    ];
    const results = await Promise.allSettled(loaders.map(([, loader]) => loader()));
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error("管理データの読み込み失敗:", loaders[i][0], result.reason);
      }
    });
  }  init();
})();