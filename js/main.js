(() => {
  "use strict";

  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";

  const state = {
    supabase: null,
    session: null,
    searchQuery: "",
    initialized: false
  };

  const $ = (selector) => document.querySelector(selector);

  function showNotice(message) {
    let notice = $(".kizimin-notice");

    if (!notice) {
      notice = document.createElement("div");
      notice.className = "kizimin-notice";
      Object.assign(notice.style, {
        position: "fixed",
        left: "50%",
        bottom: "24px",
        zIndex: "1000",
        maxWidth: "calc(100% - 32px)",
        padding: "11px 18px",
        border: "1px solid #e5e5e5",
        borderRadius: "999px",
        background: "#fff",
        color: "#222",
        boxShadow: "0 8px 30px rgba(0,0,0,.12)",
        transform: "translate(-50%, 20px)",
        opacity: "0",
        transition: "opacity .2s ease, transform .2s ease",
        pointerEvents: "none"
      });
      document.body.appendChild(notice);
    }

    notice.textContent = message;
    notice.style.opacity = "1";
    notice.style.transform = "translate(-50%, 0)";
    clearTimeout(notice._timer);
    notice._timer = setTimeout(() => {
      notice.style.opacity = "0";
      notice.style.transform = "translate(-50%, 20px)";
    }, 2200);
  }

  function renderArticles() {
    const list = $("#article-list");
    if (!list) return;

    // DBテーブルはまだ作成していないため、ここでは接続確認用の空状態を表示します。
    list.innerHTML = '<div class="empty-state">公開記事はまだありません。</div>';
  }

  function filterArticles() {
    const list = $("#article-list");
    if (!list) return;

    const articles = [...list.querySelectorAll(".article")];
    const query = state.searchQuery.trim().toLocaleLowerCase("ja-JP");

    let visible = 0;

    for (const article of articles) {
      const matched = !query || (article.textContent || "").toLocaleLowerCase("ja-JP").includes(query);
      article.hidden = !matched;
      if (matched) visible += 1;
    }

    const old = list.querySelector(".search-empty");
    if (old) old.remove();

    if (query && articles.length && visible === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state search-empty";
      empty.textContent = "「" + state.searchQuery + "」に一致する記事がありません。";
      list.appendChild(empty);
    }
  }

  function updateAccountUI() {
    const status = $("#account-status");
    const authButton = $("#auth-button");
    const logoutButton = $("#logout-button");

    if (!status || !authButton || !logoutButton) return;

    if (state.session?.user) {
      const email = state.session.user.email || "ログイン中";
      status.textContent = email;
      authButton.textContent = "アカウント";
      logoutButton.classList.remove("hidden");
    } else {
      status.textContent = "ログインしていません";
      authButton.textContent = "ログイン";
      logoutButton.classList.add("hidden");
    }
  }

  async function initializeSupabase() {
    if (!window.supabase?.createClient) {
      showNotice("Supabase JSの読み込みに失敗しました。");
      return;
    }

    state.supabase = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );

    const { data, error } = await state.supabase.auth.getSession();

    if (error) {
      console.error("Supabase session error:", error);
      showNotice("Supabaseとの接続確認に失敗しました。");
      return;
    }

    state.session = data.session;
    updateAccountUI();

    state.supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      updateAccountUI();
    });
  }

  function bindUI() {
    const search = $("#article-search");
    const authButton = $("#auth-button");
    const writeButton = $("#write-button");
    const logoutButton = $("#logout-button");

    search?.addEventListener("input", () => {
      state.searchQuery = search.value;
      filterArticles();
    });

    search?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        search.value = "";
        state.searchQuery = "";
        filterArticles();
        search.blur();
      }
    });

    authButton?.addEventListener("click", () => {
      if (state.session?.user) {
        $("#account-panel")?.scrollIntoView({ behavior: "smooth" });
      } else {
        showNotice("ログイン画面は次の実装段階で追加します。");
      }
    });

    writeButton?.addEventListener("click", () => {
      if (!state.session?.user) {
        showNotice("記事を書くにはログインが必要です。");
        return;
      }
      showNotice("記事作成画面は次の実装段階で追加します。");
    });

    logoutButton?.addEventListener("click", async () => {
      if (!state.supabase) return;
      const { error } = await state.supabase.auth.signOut();
      if (error) {
        console.error("Supabase signOut error:", error);
        showNotice("ログアウトに失敗しました。");
        return;
      }
      showNotice("ログアウトしました。");
    });
  }

  async function init() {
    if (state.initialized) return;
    state.initialized = true;

    bindUI();
    renderArticles();
    await initializeSupabase();
  }

  document.addEventListener("DOMContentLoaded", init);
  window.Kizimin = { state, init };
})();
