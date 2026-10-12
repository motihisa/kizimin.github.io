(() => {
  "use strict";
  const SUPABASE_URL="https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY="sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  const DEFAULTS={announcementTitle:"お知らせ",announcementBody:"現在、お知らせはありません。",showAnnouncements:true,termsContent:"",privacyContent:"",brandName:"Kizimin",heroTitle:"好きなことを、\n好きなように書こう。",heroDescription:"Kiziminは、記事を読んだり、書いたりできる場所。",accentColor:"#111827",backgroundColor:"#f5f7fb",textColor:"#111827",cardRadius:14,showHero:true,showDaily:true,showPopular:true,showCategories:true,showDiscovery:true,showPolls:true,showChallenges:true,showQA:true,showLibrary:true};

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
  function apply(value){
    const x={...DEFAULTS,...(value||{})}, root=document.documentElement;
    root.style.setProperty("--kizimin-accent",x.accentColor);
    root.style.setProperty("--kizimin-page-bg",x.backgroundColor);
    root.style.setProperty("--kizimin-text",x.textColor);
    root.style.setProperty("--kizimin-card-radius",Math.min(32,Math.max(0,Number(x.cardRadius)||0))+"px");
    document.body.style.backgroundColor=x.backgroundColor; document.body.style.color=x.textColor;
    document.querySelectorAll(".logo").forEach(el=>el.textContent=x.brandName);
    const hero=document.querySelector(".hero");
    if(hero){hero.hidden=!x.showHero;const h=hero.querySelector("h1"),p=hero.querySelector("p");if(h)h.textContent=x.heroTitle;if(p)p.textContent=x.heroDescription;}
    const announcements=document.getElementById("home-announcements");
    const announcementTitle=document.getElementById("announcements-heading");
    const announcementBody=document.getElementById("announcement-content");
    if(announcements){announcements.hidden=!x.showAnnouncements;}
    if(announcementTitle)announcementTitle.textContent="📢 "+(x.announcementTitle||"お知らせ");
    if(announcementBody){const body=String(x.announcementBody||"").trim();announcementBody.innerHTML=markdownToHtml(body||"現在、お知らせはありません。");}
    const visibility=[
      ["#community-daily",x.showDaily],["#community-trending",x.showPopular],["#categories",x.showCategories],
      [".discovery-widget",x.showDiscovery],["#community-polls",x.showPolls],["#community-challenges",x.showChallenges],
      ["#community-qa",x.showQA],["#community-library",x.showLibrary]
    ];
    for(const [selector,visible] of visibility){document.querySelectorAll(selector).forEach(el=>{el.hidden=!visible;});}
    document.querySelectorAll(".side-card,.categories,.popular-panel,.site-widget,.article-card,.article-item").forEach(el=>{el.style.borderRadius=Math.min(32,Math.max(0,Number(x.cardRadius)||0))+"px";});
    document.querySelectorAll(".write-button,.feature-primary").forEach(el=>{el.style.backgroundColor=x.accentColor;});
  }
  function addStyle(){
    if(!document.head)return;
    const s=document.createElement("style");
    s.textContent="body{background-color:var(--kizimin-page-bg,#f5f7fb);color:var(--kizimin-text,#111827)} .hero h1{white-space:pre-line} .side-card,.categories,.popular-panel,.site-widget{border-radius:var(--kizimin-card-radius,14px)} .write-button,.feature-primary{background-color:var(--kizimin-accent,#111827)}";
    document.head.appendChild(s);
  }
  async function run(){
    addStyle();
    try{
      if(!window.supabase?.createClient)return;
      const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
      const {data,error}=await db.from("site_editor_settings").select("setting_value").eq("setting_key","site_theme").maybeSingle();
      if(!error&&data?.setting_value)apply(data.setting_value);
    }catch(e){console.warn("サイト表示設定を読み込めませんでした。既定の表示を使用します。",e);}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run,{once:true});else run();
})();