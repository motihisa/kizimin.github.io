/* Kizimin account ban gate
 * Account BAN / suspension only.
 * No IP address is collected, read, sent, or stored.
 */
(function () {
  "use strict";

  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpbWRkYXBia2Rha3NwamFlbXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMTU0MTksImV4cCI6MjEwNjg5MTQxOX0.qezG4VOkyYfaa4DxClk1PSV7bZEne7WEbxj52m1l7iM";
  const STORAGE_KEY = "sb-bimddapbkdakspjaemsm-auth-token";
  const GATE_ID = "kizimin-account-gate";
  const REFRESH_MS = 60 * 1000;
  const REQUEST_TIMEOUT_MS = 4000;
  const originalFetch = window.fetch.bind(window);

  let gate = null;

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
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await originalFetch(SUPABASE_URL + "/rest/v1/rpc/get_my_account_state", {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: "{}",
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) return null;
      return await response.json();
    } catch (_) {
      return null;
    }
  }

  function setGate(next) {
    const before = JSON.stringify(gate);
    gate = next;
    if (before !== JSON.stringify(next)) render();
  }

  async function refresh() {
    const session = readSession();
    const token = session && session.access_token;
    if (!token) {
      setGate(null);
      return;
    }

    const state = await getAccountState(token);
    if (!state) return;

    const status = String(state.status || "").toLowerCase();
    if (status === "banned" || status === "suspended") {
      setGate({
        kind: status,
        reason: state.ban_reason || "利用ルールに違反した可能性があるため、利用が制限されています。",
        until: state.ban_expires_at || ""
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
    }
  };

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
    const copy = COPY[g.kind];
    const overlay = el(
      "div",
      "position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;overflow:auto;" +
      "background:var(--bg,#f6f7f9);color:var(--text,#1f2937);font-family:inherit;line-height:1.6;"
    );
    overlay.id = GATE_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", GATE_ID + "-title");

    const card = el(
      "div",
      "width:min(100%,480px);padding:32px 28px;background:var(--surface,#fff);" +
      "border:1px solid var(--border,#e4e7ec);border-radius:12px;box-shadow:0 6px 20px rgba(16,24,40,.07);"
    );

    card.appendChild(el(
      "p",
      "margin:0 0 6px;color:#c62828;font-size:.72rem;font-weight:800;letter-spacing:.12em;",
      copy.label
    ));

    const title = el("h1", "margin:0 0 12px;font-size:1.5rem;line-height:1.3;", copy.title);
    title.id = GATE_ID + "-title";
    card.appendChild(title);

    card.appendChild(el(
      "p",
      "margin:0;color:var(--text-secondary,#667085);overflow-wrap:anywhere;",
      copy.body
    ));

    if (g.reason) {
      const box = el(
        "div",
        "margin-top:16px;padding:12px 14px;background:var(--surface-soft,#f1f3f6);border-radius:8px;"
      );
      box.appendChild(el(
        "p",
        "margin:0 0 4px;font-size:.78rem;font-weight:700;color:var(--text-secondary,#667085);",
        "理由"
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
          "margin:12px 0 0;font-size:.78rem;font-weight:700;color:var(--text-secondary,#667085);",
          "期限"
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
      "margin:16px 0 0;font-size:.84rem;color:var(--text-muted,#98a2b3);",
      copy.note
    ));

    const actions = el("div", "display:flex;flex-wrap:wrap;gap:8px;margin-top:24px;");
    actions.appendChild(button("ログアウト", logout));
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
