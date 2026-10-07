(() => {
  "use strict";

  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  const state = { session: null, articles: [], searchQuery: "" };
  const $ = (selector) => document.querySelector(selector);

  function notice(message) {
    let el = $(".kizimin-notice");
    if (!el) {
      el = document.createElement("div");
      el.className = "kizimin-notice";
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "24px", zIndex: "1000",
        padding: "11px 18px", border: "1px solid #e5e5e5",
        borderRadius: "999px", background: "#fff", color: "#222",
        boxShadow: "0 8px 30px rgba(0,0,0,.12)",
        transform: "translate(-50%,20px)", opacity: "0",
        transition: "opacity .2s ease, transform .2s ease",
        pointerEvents: "none"
      });
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = "1";
    el.style.transform = "translate(-50%,0)";
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translate(-50%,20px)";
    }, 2200);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric", month: "long", day: "numeric"
    }).format(new Date(value));
  }

  function renderArticles() {
    const list = $("#article-list");
    if (!list) return;

    const query = state.searchQuery.trim().toLocaleLowerCase("ja-JP");
    const rows = state.articles.filter((article) => {
      if (!query) return true;
      const haystack = [
        article.title, article.excerpt, article.content,
        article.profiles?.display_name, article.categories?.name
      ].join(" ").toLocaleLowerCase("ja-JP");
      return haystack.includes(query);
    });

    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">公開記事はまだありません。</div>';
      return;
    }

    list.innerHTML = rows.map((article) => {
      const category = article.categories?.name || "その他";
      const author = article.profiles?.display_name || article.profiles?.username || "ユーザー";
      return `
        <a class="article" href="article.html?id=${encodeURIComponent(article.id)}">
          <div class="article-meta">${escapeHtml(formatDate(article.published_at || article.created_at))} · ${escapeHtml(category)}</div>
          <h3>${escapeHtml(article.title)}</h3>
          <p>${escapeHtml(article.excerpt || article.content.slice(0, 140))}</p>
          <div class="author">${escapeHtml(author)}</div>
        </a>`;
    }).join("");
  }

  async function loadArticles() {
    const list = $("#article-list");
    if (list) list.innerHTML = '<div class="loading">記事を読み込んでいます…</div>';

    try {
      // 関連テーブルをPostgRESTの埋め込みSELECTで同時取得すると、
      // 外部キーやRLSの状態によって一覧全体が失敗することがある。
      // まず記事本体だけを取得し、著者・カテゴリは補助データとして別取得する。
      const { data, error } = await supabase
        .from("articles")
        .select("id,title,slug,excerpt,content,published_at,created_at,author_id,category_id")
        .eq("status", "published")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(50);

      if (error) throw error;

      const articles = data || [];
      const authorIds = [...new Set(articles.map(a => a.author_id).filter(Boolean))];
      const categoryIds = [...new Set(articles.map(a => a.category_id).filter(Boolean))];

      const [profilesResult, categoriesResult] = await Promise.all([
        authorIds.length
          ? supabase.from("profiles").select("id,display_name,username").in("id", authorIds)
          : Promise.resolve({ data: [], error: null }),
        categoryIds.length
          ? supabase.from("categories").select("id,name,slug").in("id", categoryIds)
          : Promise.resolve({ data: [], error: null })
      ]);

      if (profilesResult.error) console.warn("記事著者情報の取得に失敗しました:", profilesResult.error);
      if (categoriesResult.error) console.warn("記事カテゴリ情報の取得に失敗しました:", categoriesResult.error);

      const profiles = new Map((profilesResult.data || []).map(p => [p.id, p]));
      const categories = new Map((categoriesResult.data || []).map(c => [c.id, c]));

      state.articles = articles.map(article => ({
        ...article,
        profiles: profiles.get(article.author_id) || null,
        categories: categories.get(article.category_id) || null
      }));

      renderArticles();
    } catch (error) {
      console.error("記事一覧の読み込みに失敗しました:", error);
      if (list) {
        list.innerHTML = '<div class="empty-state">記事を読み込めませんでした。通信状態または公開記事の権限を確認してください。</div>';
      }
    }
  }

  function updateAccountUI() {
    const status = $("#account-status");
    const authButton = $("#auth-button");
    const logout = $("#logout-button");
    if (!status || !authButton || !logout) return;

    if (state.session?.user) {
      status.textContent = state.session.user.email || "ログイン中";
      authButton.textContent = "アカウント";
      logout.classList.remove("hidden");
    } else {
      status.textContent = "ログインしていません";
      authButton.textContent = "ログイン";
      logout.classList.add("hidden");
    }
  }

  async function init() {
    const { data } = await supabase.auth.getSession();
    state.session = data.session;
    updateAccountUI();

    supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      updateAccountUI();
    });

    $("#article-search")?.addEventListener("input", (event) => {
      state.searchQuery = event.target.value;
      renderArticles();
    });

    $("#auth-button")?.addEventListener("click", () => {
      location.href = state.session?.user ? "account.html" : "login.html";
    });

    $("#write-button")?.addEventListener("click", () => {
      location.href = state.session?.user ? "write.html" : "login.html";
    });

    $("#logout-button")?.addEventListener("click", async () => {
      const { error } = await supabase.auth.signOut();
      if (error) notice("ログアウトに失敗しました。");
      else notice("ログアウトしました。");
    });

    await loadArticles();
  }

  document.addEventListener("DOMContentLoaded", init);
  window.Kizimin = { supabase, state, loadArticles };
})();
