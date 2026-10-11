(() => {
  "use strict";
  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  const AI_API_BASE = "https://kizimin-ai.mitomaru-1008.workers.dev";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const $ = id => document.getElementById(id);
  const messages = $("ai-messages");
  const form = $("ai-form");
  const send = $("ai-send");
  let session = null;

  function addMessage(text, kind) {
    const node = document.createElement("div");
    node.className = "ai-message" + (kind ? " " + kind : "");
    node.textContent = String(text || "");
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
    return node;
  }

  async function ask(prompt) {
    const cleanPrompt = String(prompt || "").trim();
    const context = $("ai-context").value.trim();
    if (!cleanPrompt) {
      $("ai-status").textContent = "依頼内容を入力してください。";
      return;
    }
    if (cleanPrompt.length > 5000 || context.length > 12000) {
      $("ai-status").textContent = "依頼内容は5,000文字以内、参考文章は12,000文字以内にしてください。";
      return;
    }
    if (!session?.access_token) {
      $("ai-status").textContent = "ログインが必要です。";
      return;
    }
    addMessage(cleanPrompt + (context ? "\n\n参考文章あり" : ""), "user");
    const placeholder = addMessage("回答を生成しています…", "");
    send.disabled = true;
    $("ai-status").textContent = "AIに接続しています。";
    try {
      const response = await fetch(AI_API_BASE + "/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Bearer " + session.access_token
        },
        body: JSON.stringify({ prompt: cleanPrompt, context })
      });
      let data = {};
      try { data = await response.json(); } catch {}
      placeholder.remove();
      if (!response.ok) {
        addMessage(data.error || "AIへの接続に失敗しました。", "error");
        $("ai-status").textContent = "接続エラー (" + response.status + ")";
        return;
      }
      addMessage(data.text || "回答が空でした。", "");
      $("ai-status").textContent = "回答が完了しました。";
    } catch (error) {
      placeholder.remove();
      addMessage("AIサーバーに接続できませんでした。時間をおいて再試行してください。", "error");
      $("ai-status").textContent = "ネットワークエラー";
      console.error("Kizimin AI request failed", error);
    } finally {
      send.disabled = false;
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    void ask($("ai-prompt").value);
  });
  document.querySelectorAll("[data-prompt]").forEach(button => {
    button.addEventListener("click", () => {
      $("ai-prompt").value = button.dataset.prompt || "";
      if (!$("ai-context").value.trim()) $("ai-context").focus();
      else void ask($("ai-prompt").value);
    });
  });

  sb.auth.getSession().then(({ data }) => {
    session = data?.session || null;
    if (!session) {
      const next = location.pathname + location.search + location.hash;
      location.href = "login.html?next=" + encodeURIComponent(next);
      return;
    }
    sb.from("profiles").select("account_status").eq("id", session.user.id).maybeSingle().then(({data: profile, error}) => {
      if (error || !profile) return;
      if (["banned", "suspended", "disabled"].includes(String(profile.account_status || "").toLowerCase())) {
        addMessage("このアカウントではAI連携を利用できません。", "error");
        form.querySelectorAll("button").forEach(button => button.disabled = true);
      }
    });
  });
  sb.auth.onAuthStateChange((_event, nextSession) => { session = nextSession; });
})();