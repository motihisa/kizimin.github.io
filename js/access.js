(() => {
  "use strict";

  // アクセス記録にはIPアドレスなどの個人情報を保存しません。
  // 各ページで独立してSupabaseへ接続するため、window.Kiziminの初期化状態に依存しません。
  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";

  if (!window.supabase?.createClient) return;

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const path = location.pathname || "/";

  void sb.from("access_logs").insert({ path }).then(({ error }) => {
    if (error) console.debug("アクセス記録を保存できませんでした。", error);
  });
})();