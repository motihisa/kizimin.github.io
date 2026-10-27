(() => {
  "use strict";

  // アクセス記録にはIPアドレスなどの個人情報を保存しません。
  // 各ページで独立してSupabaseへ接続するため、window.Kiziminの初期化状態に依存しません。
  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";

  if (!window.supabase?.createClient) return;

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const path = location.pathname || "/";

  // 管理画面自身の閲覧は公開サイトのアクセス記録に混ぜない。
  if (/\/admin(?:\.html)?\/?$/i.test(path)) return;

  // セッションがある場合のみ本人のユーザーIDを記録。IPアドレスは取得・保存しない。
  void sb.auth.getSession().then(({ data, error: sessionError }) => {
    if (sessionError) console.debug("ログイン状態を確認できませんでした。", sessionError);
    const userId = data?.session?.user?.id || null;
    return sb.from("access_logs").insert({ path, user_id: userId });
  }).then(({ error }) => {
    if (error) console.debug("アクセス記録を保存できませんでした。", error);
  }).catch(error => console.debug("アクセス記録を保存できませんでした。", error));
})();