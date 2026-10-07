(() => {
  "use strict";

  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpbWRkYXBia2Rha3NwamFlbXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMTU0MTksImV4cCI6MjEwNjg5MTQxOX0.qezG4VOkyYfaa4DxClk1PSV7bZEne7WEbxj52m1l7iM";

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const state = { session: null, articles: [], categories: [], searchQuery: "" };
  const $ = (selector) => document.querySelector(selector);

  function notice(message) {
    let el = $(".kizimin-notice");
    if (!el) {
      el = document.createElement("div");
      el.className = "kizimin-notice";
      Object.assign(el.style, {position:"fixed",left:"50%",bottom:"24px",zIndex:"1000",padding:"11px 18px",border:"1px solid #e5e5e5",borderRadius:"999px",background:"#fff",color:"#222",boxShadow:"0 8px 30px rgba(0,0,0,.12)",transform:"translate(-50%,20px)",opacity:"0",transition:"opacity .2s ease, transform .2s ease",pointerEvents:"none"});
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = "1";
    el.style.transform = "translate(-50%,0)";
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translate(-50%,20px)"; }, 2200);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("ja-JP", {year:"numeric",month:"long",day:"numeric"}).format(new Date(value));
  }

  function renderCategories() {
    const box = $(".category-list");
    if (!box) return;
    const categories = state.categories;
    if (!categories.length) {
      box.innerHTML = '<span class="text-muted">カテゴリはありません。</span>';
      return;
    }
    box.innerHTML = categories.map(c =>
      '<a class="category" href="#category-' + encodeURIComponent(c.slug || c.id) + '">' + escapeHtml(c.name) + '</a>'
    ).join("");
  }

  async function loadCategories() {
    const box = $(".category-list");
    try {
      const {data, error} = await supabase.from("categories").select("id,name,slug").order("name", {ascending:true});
      if (error) throw error;
      state.categories = data || [];
      renderCategories();
    } catch (error) {
      console.error("カテゴリの読み込みに失敗しました:", error);
      if (box) box.innerHTML = '<span class="text-muted">カテゴリを読み込めませんでした。</span>';
    }
  }

  function renderArticles() {
    const list = $("#article-list");
    if (!list) return;
    const query = state.searchQuery.trim().toLocaleLowerCase("ja-JP");
    const rows = state.articles.filter((article) => {
      if (!query) return true;
      const haystack = [article.title,article.excerpt,article.content,article.profiles?.display_name,article.categories?.name].join(" ").toLocaleLowerCase("ja-JP");
      return haystack.includes(query);
    });
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">公開記事はまだありません。</div>';
      return;
    }
    list.innerHTML = rows.map((article) => {
      const category = article.categories?.name || "その他";
      const author = article.profiles?.display_name || article.profiles?.username || "ユーザー";
      const authorLink = article.author_id ? 'profile.html?id='+encodeURIComponent(article.author_id) : '#';
      return '<a class="article" href="article.html?id='+encodeURIComponent(article.id)+'"><div class="article-meta">'+escapeHtml(formatDate(article.published_at || article.created_at))+' · '+escapeHtml(category)+'</div><h3>'+escapeHtml(article.title)+'</h3><p>'+escapeHtml(article.excerpt || String(article.content || "").slice(0,140))+'</p><div class="author" onclick="event.stopPropagation()"><a href="'+authorLink+'">'+escapeHtml(author)+'</a></div></a>';
    }).join("");
  }

  async function loadArticles() {
    const list = $("#article-list");
    if (list) list.innerHTML = '<div class="loading">記事を読み込んでいます…</div>';
    try {
      const {data,error} = await supabase.from("articles").select("id,title,slug,excerpt,content,published_at,created_at,author_id,category_id").eq("status","published").order("published_at",{ascending:false,nullsFirst:false}).limit(50);
      if (error) throw error;
      const articles = data || [];
      const authorIds = [...new Set(articles.map(a=>a.author_id).filter(Boolean))];
      const categoryIds = [...new Set(articles.map(a=>a.category_id).filter(Boolean))];
      const [profilesResult,categoriesResult] = await Promise.all([
        authorIds.length ? supabase.from("profiles").select("id,display_name,username").in("id",authorIds) : Promise.resolve({data:[],error:null}),
        categoryIds.length ? supabase.from("categories").select("id,name,slug").in("id",categoryIds) : Promise.resolve({data:[],error:null})
      ]);
      const profiles = new Map((profilesResult.data || []).map(p=>[p.id,p]));
      const categories = new Map((categoriesResult.data || []).map(c=>[c.id,c]));
      state.articles = articles.map(article=>({...article,profiles:profiles.get(article.author_id)||null,categories:categories.get(article.category_id)||null}));
      renderArticles();
    } catch (error) {
      console.error("記事一覧の読み込みに失敗しました:", error);
      if (list) list.innerHTML = '<div class="empty-state">記事を読み込めませんでした。権限または通信状態を確認してください。</div>';
    }
  }

  function updateAccountUI() {
    const status=$("#account-status"),authButton=$("#auth-button"),logout=$("#logout-button");
    if (!status || !authButton || !logout) return;
    if (state.session?.user) {
      status.textContent=state.session.user.email||"ログイン中"; authButton.textContent="アカウント"; logout.classList.remove("hidden");
    } else {
      status.textContent="ログインしていません"; authButton.textContent="ログイン"; logout.classList.add("hidden");
    }
  }

  async function init() {
    const {data} = await supabase.auth.getSession();
    state.session=data.session;
    updateAccountUI();
    supabase.auth.onAuthStateChange((_event,session)=>{state.session=session;updateAccountUI();});
    $("#article-search")?.addEventListener("input",(event)=>{state.searchQuery=event.target.value;renderArticles();});
    $("#auth-button")?.addEventListener("click",()=>{location.href=state.session?.user?"account.html":"login.html";});
    $("#write-button")?.addEventListener("click",()=>{location.href=state.session?.user?"write.html":"login.html";});
    $("#logout-button")?.addEventListener("click",async()=>{const {error}=await supabase.auth.signOut();if(error)notice("ログアウトに失敗しました。");else notice("ログアウトしました。");});
    await Promise.all([loadCategories(),loadArticles()]);
  }

  document.addEventListener("DOMContentLoaded",init);
  window.Kizimin={supabase,state,loadArticles,loadCategories};
})();