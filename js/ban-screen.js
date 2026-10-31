/* Kizimin account ban gate
 * Account BAN / suspension only.
 * No IP address is collected, read, sent, or stored.
 */
(function () {
  "use strict";

  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  const STORAGE_KEY = "sb-bimddapbkdakspjaemsm-auth-token";
  const GATE_ID = "kizimin-account-gate";
  const REFRESH_MS = 60 * 1000;
  const REQUEST_TIMEOUT_MS = 8000;
  const REQUEST_RETRIES = 1;
  const originalFetch = window.fetch.bind(window);

  let gate = null;
  let siteTheme = {};
  let siteThemeLoadedAt = 0;

  function readSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.access_token) return parsed;
      return (parsed && parsed.currentSession) || null;
    } catch (_) {
      return null;
    }
  }

  async function getAccountState(token) {
    if (!token) return null;

    for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await originalFetch(SUPABASE_URL + "/rest/v1/rpc/get_my_account_state", {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + token,
            "Content-Type": "application/json"
          },
          body: "{}",
          signal: controller.signal,
          cache: "no-store"
        });

        if (!response.ok) {
          // Authentication/permission errors should not be retried.
          if (response.status === 401 || response.status === 403) return null;
          if (attempt < REQUEST_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 700));
            continue;
          }
          return null;
        }

        return await response.json();
      } catch (_) {
        if (attempt < REQUEST_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 700));
          continue;
        }
        return null;
      } finally {
        clearTimeout(timeout);
      }
    }

    return null;
  }

  function setGate(next) {
    const before = JSON.stringify(gate);
    gate = next;
    if (before !== JSON.stringify(next)) render();
  }

  async function loadSiteTheme(token) {
    if (!token || Date.now() - siteThemeLoadedAt < 60000) return;
    try {
      const response = await originalFetch(
        SUPABASE_URL + "/rest/v1/site_editor_settings?select=setting_value&setting_key=eq.site_theme",
        { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token }, cache: "no-store" }
      );
      if (!response.ok) return;
      const rows = await response.json();
      if (Array.isArray(rows) && rows[0] && rows[0].setting_value && typeof rows[0].setting_value === "object") {
        siteTheme = rows[0].setting_value;
        siteThemeLoadedAt = Date.now();
        if (gate) { const node = document.getElementById(GATE_ID); if (node) node.removeAttribute("data-key"); render(); }
      }
    } catch (_) {}
  }

  async function refresh() {
    const session = readSession();
    const token = session && session.access_token;
    await loadSiteTheme(token);
    if (!token) {
      setGate(null);
      return;
    }

    // The site owner is the only account-status exception. Admins and moderators
    // remain subject to BAN/suspension like every other account.
    let metadata = session.user?.app_metadata || {};
    try {
      const authUserResponse = await originalFetch(SUPABASE_URL + "/auth/v1/user", {
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token },
        cache: "no-store"
      });
      if (authUserResponse.ok) {
        const authUser = await authUserResponse.json();
        metadata = authUser.app_metadata || metadata;
      }
    } catch (_) {}
    if (metadata.must_change_password === true && !/\/password-change\.html$/.test(location.pathname)) {
      location.replace("password-change.html");
      return;
    }

    let isOwner = false;
    try {
      const ownerResponse = await originalFetch(SUPABASE_URL + "/rest/v1/rpc/is_site_owner", {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store"
      });
      if (ownerResponse.ok) isOwner = (await ownerResponse.json()) === true;
    } catch (_) {}
    if (isOwner) {
      setGate(null);
      return;
    }

    const result = await getAccountState(token);
    if (!result) return;

    // PostgREST returns TABLE-valued RPC results as an array.
    const state = Array.isArray(result) ? result[0] : result;
    if (!state) return;

    const status = String(state.status || "").toLowerCase();
    if (status === "banned" || status === "suspended" || status === "protected") {
      setGate({
        kind: status,
        reason: state.reason || state.ban_reason || "利用ルールに違反した可能性があるため、利用が制限されています。",
        until: state.expires_at || state.ban_expires_at || ""
      });
      return;
    }

    setGate(null);
  }

  const COPY = {
    banned: {
      label: "ACCOUNT BANNED",
      title: "アカウントがBANされています",
      body: "このアカウントは、利用ルールに違反した可能性があるため、利用できなくなっています。",
      note: "内容に心当たりがない場合は、管理者にお問い合わせください。"
    },
    suspended: {
      label: "ACCOUNT SUSPENDED",
      title: "アカウントは一時停止中です",
      body: "管理者が停止を解除するまで、サイトを利用できません。",
      note: "内容に心当たりがない場合は、管理者にお問い合わせください。"
    },
    protected: {
      label: "ACCOUNT PROTECTED",
      title: "アカウントを保護しています",
      body: "長期間利用が確認されなかったため、不正利用を防ぐ目的でアカウントを一時的に保護しています。",
      note: "解除申請は問い合わせの件名に「アカウント保護の解除申請」と入力してください。登録メールアドレス宛てに確認連絡をお送りします。パスワードは絶対に入力・送信しないでください。"
    }
  };

  function accountCopy(kind) {
    const defaults = COPY[kind] || COPY.banned;
    if (kind === "protected") return defaults;
    if (kind === "suspended") {
      return {
        label: siteTheme.suspendedLabel || defaults.label,
        title: siteTheme.suspendedTitle || defaults.title,
        body: siteTheme.suspendedBody || defaults.body,
        note: siteTheme.suspendedNote || defaults.note
      };
    }
    return {
      label: siteTheme.banLabel || defaults.label,
      title: siteTheme.banTitle || defaults.title,
      body: siteTheme.banBody || defaults.body,
      note: siteTheme.banNote || defaults.note
    };
  }

  function el(tag, style, text) {
    const node = document.createElement(tag);
    if (style) node.style.cssText = style;
    if (text) node.textContent = text;
    return node;
  }

  function button(label, onClick) {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.style.cssText =
      "min-height:40px;padding:0 16px;display:inline-flex;align-items:center;justify-content:center;" +
      "border:1px solid #cfd4dc;border-radius:8px;background:#fff;color:inherit;font:inherit;font-weight:700;" +
      "cursor:pointer;";
    if (onClick) node.addEventListener("click", onClick);
    return node;
  }

  async function logout() {
    const session = readSession();
    try {
      if (session && session.access_token) {
        await originalFetch(SUPABASE_URL + "/auth/v1/logout?scope=global", {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + session.access_token
          }
        });
      }
    } catch (_) {}

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}

    location.href = "login.html";
  }

  function formatExpiry(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function buildGate(g) {
    const copy = accountCopy(g.kind);
    const overlay = el(
      "div",
      "position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;overflow:auto;" +
      "background:" + (siteTheme.accountBgColor || "#f6f7f9") + ";color:" + (siteTheme.accountTextColor || "#1f2937") + ";font-family:inherit;line-height:1.6;"
    );
    overlay.id = GATE_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", GATE_ID + "-title");

    const card = el(
      "div",
      "width:min(100%,480px);padding:32px 28px;background:" + (siteTheme.accountCardColor || "#ffffff") + ";" +
      "border:1px solid #e4e7ec;border-radius:12px;box-shadow:0 6px 20px rgba(16,24,40,.07);"
    );

    card.appendChild(el(
      "p",
      "margin:0 0 6px;color:" + (siteTheme.accountAccentColor || "#c62828") + ";font-size:.72rem;font-weight:800;letter-spacing:.12em;",
      copy.label
    ));

    const title = el("h1", "margin:0 0 12px;font-size:1.5rem;line-height:1.3;color:" + (siteTheme.accountTextColor || "#1f2937") + ";", copy.title);
    title.id = GATE_ID + "-title";
    card.appendChild(title);

    card.appendChild(el(
      "p",
      "margin:0;color:" + (siteTheme.accountTextColor || "#667085") + ";overflow-wrap:anywhere;",
      copy.body
    ));

    if (g.reason) {
      const box = el(
        "div",
        "margin-top:16px;padding:12px 14px;background:" + (siteTheme.accountBgColor || "#f1f3f6") + ";border-radius:8px;"
      );
      box.appendChild(el(
        "p",
        "margin:0 0 4px;font-size:.78rem;font-weight:700;color:" + (siteTheme.accountTextColor || "#667085") + ";",
        siteTheme.accountReasonLabel || "理由"
      ));
      box.appendChild(el(
        "p",
        "margin:0;white-space:pre-wrap;overflow-wrap:anywhere;",
        g.reason
      ));

      const expiry = formatExpiry(g.until);
      if (expiry) {
        box.appendChild(el(
          "p",
          "margin:12px 0 0;font-size:.78rem;font-weight:700;color:" + (siteTheme.accountTextColor || "#667085") + ";",
          siteTheme.accountExpiryLabel || "期限"
        ));
        box.appendChild(el(
          "p",
          "margin:0;overflow-wrap:anywhere;",
          expiry + "（日本時間）"
        ));
      }

      card.appendChild(box);
    }

    card.appendChild(el(
      "p",
      "margin:16px 0 0;font-size:.84rem;color:" + (siteTheme.accountTextColor || "#667085") + ";",
      copy.note
    ));

    const actions = el("div", "display:flex;flex-wrap:wrap;gap:8px;margin-top:24px;");
    actions.appendChild(button(siteTheme.accountContactLabel || "お問い合わせ", function () { location.href = "inquiry.html"; }));
    card.appendChild(actions);

    overlay.appendChild(card);
    return overlay;
  }

  function setInert(on) {
    Array.prototype.forEach.call(document.body.children, function (child) {
      if (child.id === GATE_ID || child.tagName === "SCRIPT") return;
      if (on) child.setAttribute("inert", "");
      else child.removeAttribute("inert");
    });
  }

  function render() {
    if (!document.body) return;

    let node = document.getElementById(GATE_ID);
    if (!gate) {
      if (node) node.remove();
      setInert(false);
      document.documentElement.style.overflow = "";
      return;
    }

    const key = JSON.stringify(gate);
    if (node && node.getAttribute("data-key") === key) return;
    if (node) node.remove();

    node = buildGate(gate);
    node.setAttribute("data-key", key);
    document.body.appendChild(node);
    setInert(true);
    document.documentElement.style.overflow = "hidden";

    const firstButton = node.querySelector("button");
    if (firstButton) firstButton.focus();
  }

  function start() {
    refresh();

    window.addEventListener("storage", function (event) {
      if (event.key === STORAGE_KEY) refresh();
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refresh();
    });

    setInterval(refresh, REFRESH_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
