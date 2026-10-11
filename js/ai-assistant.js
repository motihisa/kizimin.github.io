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
  const usageLabel = $("ai-usage");

  function renderUsage(usage) {
    if (!usageLabel || !usage) return;
    if (usage.reason === "daily_limit" || Number(usage.remaining_today) === 0) {
      usageLabel.textContent = "本日の利用上限に達しました（" + (usage.daily_limit || 20) + "回/日）。";
      return;
    }
    const remaining = Number(usage.remaining_today);
    if (Number.isFinite(remaining)) {
      usageLabel.textContent = "本日 " + (usage.used_today ?? (usage.daily_limit - remaining)) + "/" + (usage.daily_limit || 20) + "回使用・残り " + remaining + "回（1分8回まで）";
    }
  }

  async function refreshUsage() {
    if (!session?.access_token || !usageLabel) return;
    try {
      const { data, error } = await sb.rpc("get_ai_usage_status");
      if (error) throw error;
      renderUsage(data);
    } catch (error) {
      usageLabel.textContent = "利用状況を取得できません。";
      console.warn("AI usage status unavailable", error);
    }
  }

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
        renderUsage(data.usage);
        $("ai-status").textContent = "接続エラー (" + response.status + ")";
        return;
      }
      addMessage(data.text || "回答が空でした。", "");
      renderUsage(data.usage);
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
    void refreshUsage();
    sb.from("profiles").select("account_status").eq("id", session.user.id).maybeSingle().then(({data: profile, error}) => {
      if (error || !profile) return;
      if (["banned", "suspended", "disabled"].includes(String(profile.account_status || "").toLowerCase())) {
        addMessage("このアカウントではAI連携を利用できません。", "error");
        form.querySelectorAll("button").forEach(button => button.disabled = true);
      }
    });
  });
  sb.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession;
    void refreshUsage();
  });
})();