(() => {
  "use strict";
  const URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";

  function markdownToHtml(source) {
    const escHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const inline = value => {
      let s = escHtml(value);
      const codes = [];
      s = s.replace(/`([^`]+)`/g, (_, code) => { const i=codes.push(code)-1; return "@@MDCODE"+i+"@@"; });
      s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
           .replace(/__([^_]+)__/g, "<strong>$1</strong>")
           .replace(/\*([^*]+)\*/g, "<em>$1</em>")
           .replace(/_([^_]+)_/g, "<em>$1</em>")
           .replace(/~~([^~]+)~~/g, "<del>$1</del>");
      return s.replace(/@@MDCODE(\d+)@@/g, (_, i) => "<code>"+codes[Number(i)]+"</code>");
    };
    const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let paragraph = [], list = [], listType = "", quote = [], code = [], inCode = false;
    const flushParagraph = () => { if (paragraph.length) { out.push("<p>"+paragraph.map(inline).join(" ")+"</p>"); paragraph=[]; } };
    const flushList = () => { if (list.length) { out.push("<"+listType+">"+list.map(item=>"<li>"+inline(item)+"</li>").join("")+"</"+listType+">"); list=[]; listType=""; } };
    const flushQuote = () => { if (quote.length) { flushParagraph(); flushList(); out.push("<blockquote><p>"+quote.map(inline).join(" ")+"</p></blockquote>"); quote=[]; } };
    const flushCode = () => { if (code.length) { out.push("<pre><code>"+escHtml(code.join("\n"))+"</code></pre>"); code=[]; } };
    for (const raw of lines) {
      if (raw.trim().startsWith("```")) {
        flushParagraph(); flushList(); flushQuote();
        if (inCode) { flushCode(); inCode=false; } else { inCode=true; }
        continue;
      }
      if (inCode) { code.push(raw); continue; }
      if (!raw.trim()) { flushParagraph(); flushList(); flushQuote(); continue; }
      let m;
      if (/^\s*---+\s*$/.test(raw) || /^\s*\*\*\*+\s*$/.test(raw)) { flushParagraph(); flushList(); flushQuote(); out.push("<hr>"); continue; }
      if ((m=raw.match(/^\s*(#{1,3})\s+(.+)$/))) { flushParagraph(); flushList(); flushQuote(); const n=m[1].length; out.push("<h"+n+">"+inline(m[2])+"</h"+n+">"); continue; }
      if ((m=raw.match(/^\s*>\s?(.*)$/))) { flushParagraph(); flushList(); quote.push(m[1]); continue; } else flushQuote();
      if ((m=raw.match(/^\s*[-*+]\s+(.+)$/))) { flushParagraph(); if(listType==="ol") flushList(); listType="ul"; list.push(m[1]); continue; }
      if ((m=raw.match(/^\s*\d+[.)]\s+(.+)$/))) { flushParagraph(); if(listType==="ul") flushList(); listType="ol"; list.push(m[1]); continue; }
      flushList(); paragraph.push(raw);
    }
    flushParagraph(); flushList(); flushQuote(); flushCode();
    return out.join("\n");
  }
  function render(article, text) {
    const nav = article.querySelector(".legal-nav");
    const content = document.createElement("div");
    content.className = "legal-custom-content markdown-content";
    content.innerHTML = markdownToHtml(text);
    article.replaceChildren(content);
    if (nav) article.appendChild(nav);
  }
  async function run() {
    const article = document.querySelector(".legal-card[data-legal-key]");
    if (!article || !window.supabase?.createClient) return;
    try {
      const db = window.supabase.createClient(URL, KEY);
      const { data, error } = await db.from("site_editor_settings").select("setting_value").eq("setting_key", "site_theme").maybeSingle();
      if (error) throw error;
      const key = article.dataset.legalKey;
      const custom = String(data?.setting_value?.[key] || "").trim();
      if (custom) render(article, custom);
    } catch (error) {
      console.warn("編集済みの規約文章を読み込めませんでした。既定の文章を表示します。", error);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
})();
