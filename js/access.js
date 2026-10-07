(() => {
  "use strict";

  // アクセス記録にはIPアドレスなどの個人情報を保存しません。
  // 各ページで独立してSupabaseへ接続するため、window.Kiziminの初期化状態に依存しません。
  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpbWRkYXBia2Rha3NwamFlbXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMTU0MTksImV4cCI6MjEwNjg5MTQxOX0.qezG4VOkyYfaa4DxClk1PSV7bZEne7WEbxj52m1l7iM";

  if (!window.supabase?.createClient) return;

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const path = location.pathname || "/";

  void sb.from("access_logs").insert({ path }).then(({ error }) => {
    if (error) console.debug("アクセス記録を保存できませんでした。", error);
  });
})();