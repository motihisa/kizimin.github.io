(() => {
  "use strict";
  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  if (!document.getElementById("editor-loading") || !document.getElementById("editor-app")) return;
  if (!window.supabase?.createClient) { const loading=document.getElementById("editor-loading"); if(loading) loading.textContent="Supabaseライブラリを読み込めませんでした。ページを再読み込みしてください。"; return; }
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"\']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#039;"}[c]));

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
  const DEFAULTS = {
    announcementTitle:"お知らせ", announcementBody:"現在、お知らせはありません。", showAnnouncements:true,
    termsContent:`# Kizimin 利用規約

最終更新日：2026年10月11日

この利用規約（以下「本規約」）は、Kizimin（以下「本サービス」）の利用条件を定めるものです。本サービスを利用する方は、本規約に同意したものとします。

## 1. 提供するサービス
本サービスは、ユーザーが記事を投稿・閲覧し、コメントやリアクション等を通じて交流するためのサービスです。機能は予告なく追加、変更、一時停止される場合があります。

## 2. アカウント
登録情報は正確かつ最新の状態に保ってください。
アカウントの認証情報は適切に管理し、第三者に使用させないでください。
アカウントの不正利用が疑われる場合は、運営へ連絡してください。

## 3. 投稿コンテンツ
投稿内容の責任は投稿したユーザーにあります。投稿する内容について、必要な権利や許可を得ていることを確認してください。投稿によって、第三者の著作権、プライバシー、名誉その他の権利を侵害してはいけません。

## 4. 禁止事項
法令に違反する行為、犯罪を助長する行為
嫌がらせ、差別、脅迫、名誉毀損、個人情報の無断公開
スパム、詐欺、なりすまし、過度な宣伝
他者の権利を侵害する投稿
本サービスへの不正アクセス、セキュリティ機能の回避、サービス運営を妨害する行為
その他、運営が安全な利用を妨げると判断する行為

## 5. 通報・投稿の管理
利用者は記事等を通報できます。運営は通報内容を確認し、必要に応じて投稿の非表示、削除、アカウントの制限などを行う場合があります。通報の受付は、必ずしも措置を保証するものではありません。

## 6. サービスの停止・変更
保守、障害、セキュリティ上の必要その他の理由により、本サービスの全部または一部を停止・変更する場合があります。

## 7. 免責事項
運営は、法令で認められる範囲で、本サービスの継続性、正確性、完全性、特定目的への適合性を保証しません。利用者間または利用者と第三者の間で生じた紛争は、当事者間で解決するものとします。

## 8. 規約の変更
必要に応じて本規約を変更することがあります。変更後の規約は本ページに掲載した時点から適用します。

## 9. お問い合わせ
本規約に関する連絡はお問い合わせフォームから送信してください。`,
    privacyContent:`# Kizimin プライバシーポリシー

最終更新日：2026年10月11日

本ポリシーは、Kiziminがサービス提供に関連して取り扱う情報について説明します。

## 1. 取り扱う情報
アカウント登録・プロフィール情報（ユーザー名、表示名、プロフィール画像など）
ユーザーが作成した記事、コメント、いいね、保存設定などのコンテンツ・操作情報
問い合わせフォームで入力された名前、返信先メールアドレス、件名、問い合わせ内容
通報の理由、対象記事、送信者ID、運営による対応状況・メモ
認証、セキュリティ対策、障害調査、サービス運用に必要な技術情報や操作ログ
問い合わせ時の名前やメールアドレスは任意です。ただし、返信先がない場合は個別の返信ができないことがあります。

## 2. 利用目的
アカウント認証とユーザー向け機能の提供
記事・コメント等の表示、保存、リアクションの管理
問い合わせへの回答、通報内容の確認、規約違反への対応
不正利用の防止、セキュリティ確保、障害の調査
機能改善とサービスの維持・運営

## 3. 公開される情報
公開設定の記事、コメント、プロフィール等は、設定や機能に応じて他の利用者に表示されます。パスワード、問い合わせ内容、通報内容、管理者向けメモなどを公開プロフィールに掲載しないでください。通報と問い合わせは運営による対応のために扱います。

## 4. 第三者サービス
本サービスは、認証・データ保存等にSupabase、ソースコードや公開ページの配信にGitHub Pages等の外部サービスを利用しています。これらのサービスでは、それぞれの提供者の規約やプライバシー方針に従って情報が処理される場合があります。

## 5. 保存と安全管理
情報は、サービス提供、問い合わせ対応、通報確認、セキュリティ確保に必要な期間保存します。アクセス制御などの対策を講じますが、インターネット上の送受信や電子保存について完全な安全性を保証することはできません。

## 6. 第三者への提供
法令に基づく場合、本人の同意がある場合、サービス運営に必要な委託先へ必要な範囲で共有する場合、または安全確保・権利保護のために必要な場合を除き、個人情報を第三者へ提供しないよう取り扱います。

## 7. 利用者からの依頼
自身の情報の確認・訂正・削除に関する依頼は、お問い合わせフォームから送信してください。本人確認や法令・運用上の制約により、希望どおりに対応できない場合があります。

## 8. ポリシーの変更
サービスや法令の変更に応じて本ポリシーを更新する場合があります。更新後の内容は本ページに掲載します。

## 9. お問い合わせ
個人情報の取り扱いに関する連絡はお問い合わせフォームから送信してください。`,
    brandName:"Kizimin", heroTitle:"好きなことを、\n好きなように書こう。", heroDescription:"Kiziminは、記事を読んだり、書いたりできる場所。",
    accentColor:"#111827", backgroundColor:"#f5f7fb", textColor:"#111827", cardRadius:14,
    showHero:true, showDaily:true, showPopular:true, showCategories:true, showDiscovery:true,
    showPolls:true, showChallenges:true, showQA:true, showLibrary:true
  };
  let userId = null, saved = {...DEFAULTS};
  const status = (message, kind="") => { const el=$("editor-status"); if(!el)return; el.textContent=message; el.className="editor-status"+(kind?" "+kind:""); };
  function denied(message){ $("editor-loading")?.classList.add("hidden"); $("editor-app")?.classList.add("hidden"); $("editor-denied")?.classList.remove("hidden"); const reason=$("editor-denied-reason"); if(reason)reason.textContent=message; }
  async function authorize(){
    const {data:{session},error}=await db.auth.getSession();
    if(error){denied("ログイン状態を確認できませんでした。");return false;}
    if(!session?.user?.id){location.href="login.html";return false;}
    userId=session.user.id;
    const {data:profile,error:profileError}=await db.from("profiles").select("role,account_status").eq("id",userId).maybeSingle();
    if(profileError){denied("管理者権限の確認に失敗しました。");return false;}
    const {data:ownerFlag,error:ownerError}=await db.rpc("is_site_owner");
    const isOwner=!ownerError && ownerFlag===true;
    if(!isOwner || (profile?.account_status && profile.account_status!=="active")){denied("サイトエディターを利用できるのはオーナーのみです。");return false;}
    $("editor-loading").classList.add("hidden"); $("editor-app").classList.remove("hidden");
    return true;
  }
  function readForm(){
    return {
      brandName:$("brand-name").value.trim().slice(0,60) || DEFAULTS.brandName,
      heroTitle:$("hero-title").value.slice(0,180),
      heroDescription:$("hero-description").value.slice(0,500),
      announcementTitle:$("announcement-title").value.trim().slice(0,80)||"お知らせ",
      announcementBody:$("announcement-body").value.slice(0,3000),
      showAnnouncements:$("show-announcements").checked,
      termsContent:$("terms-content").value.slice(0,30000), privacyContent:$("privacy-content").value.slice(0,30000),
      accentColor:$("accent-color").value, backgroundColor:$("background-color").value,
      textColor:$("text-color").value, cardRadius:Math.min(32,Math.max(0,Number($("card-radius").value)||0)),
      showHero:$("show-hero").checked, showDaily:$("show-daily").checked, showPopular:$("show-popular").checked,
      showCategories:$("show-categories").checked, showDiscovery:$("show-discovery").checked,
      showPolls:$("show-polls").checked, showChallenges:$("show-challenges").checked,
      showQA:$("show-qa").checked, showLibrary:$("show-library").checked
    };
  }
  function fillForm(v){
    const x={...DEFAULTS,...(v||{})};
    $("brand-name").value=x.brandName; $("hero-title").value=x.heroTitle; $("hero-description").value=x.heroDescription;
    $("announcement-title").value=x.announcementTitle; $("announcement-body").value=x.announcementBody;
    $("show-announcements").checked=!!x.showAnnouncements; $("terms-content").value=x.termsContent||""; $("privacy-content").value=x.privacyContent||"";
    $("accent-color").value=x.accentColor; $("background-color").value=x.backgroundColor; $("text-color").value=x.textColor;
    $("card-radius").value=x.cardRadius;
    for(const [id,key] of [["show-hero","showHero"],["show-daily","showDaily"],["show-popular","showPopular"],["show-categories","showCategories"],["show-discovery","showDiscovery"],["show-polls","showPolls"],["show-challenges","showChallenges"],["show-qa","showQA"],["show-library","showLibrary"]]) $(id).checked=!!x[key];
    preview(x);
  }
  function preview(v){
    const x={...DEFAULTS,...v};
    $("preview-head").textContent=x.brandName; $("preview-title").textContent=x.heroTitle; $("preview-description").textContent=x.heroDescription;
    $("preview-announcements").replaceChildren(); const announcementLabel=document.createElement("strong"); announcementLabel.textContent="📢 "+x.announcementTitle; $("preview-announcements").appendChild(announcementLabel); const announcementBody=document.createElement("div"); announcementBody.innerHTML=markdownToHtml(x.announcementBody||"現在、お知らせはありません。"); $("preview-announcements").appendChild(announcementBody);
    for(const [id,value] of [["preview-announcement-body",x.announcementBody],["preview-terms-content",x.termsContent],["preview-privacy-content",x.privacyContent]]) { const node=$(id); if(node) node.innerHTML=markdownToHtml(value||""); }
    $("preview-announcements").hidden=!x.showAnnouncements;
    const p=$("editor-preview");
    p.style.setProperty("--preview-accent",x.accentColor); p.style.setProperty("--preview-bg",x.backgroundColor);
    p.style.setProperty("--preview-text",x.textColor); p.style.setProperty("--preview-radius",x.cardRadius+"px");
    $("preview-hero").hidden=!x.showHero; $("preview-popular").hidden=!x.showPopular; $("preview-categories").hidden=!x.showCategories;
    $("preview-community").hidden=!(x.showDaily||x.showPolls||x.showChallenges||x.showQA||x.showLibrary);
    $("preview-latest").style.borderRadius=x.cardRadius+"px";
  }
  async function loadHistory(){
    const body=$("editor-history-body"); if(!body)return;
    const {data,error}=await db.from("site_editor_history").select("id,setting_key,action,changed_by,changed_at,old_value,new_value").order("changed_at",{ascending:false}).limit(20);
    if(error){body.innerHTML='<tr><td colspan="4">履歴を読み込めませんでした。</td></tr>';return;}
    if(!data?.length){body.innerHTML='<tr><td colspan="4">まだ変更履歴はありません。</td></tr>';return;}
    body.innerHTML=data.map(row=>{
      const before=JSON.stringify(row.old_value); const after=JSON.stringify(row.new_value);
      const diff=(before?("前: "+before.slice(0,180)):"前: なし")+" / "+(after?("後: "+after.slice(0,180)):"後: なし");
      return '<tr><td>'+esc(new Date(row.changed_at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}))+'</td><td>'+esc(({insert:"作成",update:"更新",delete:"削除"})[row.action]||row.action)+'</td><td>'+esc(row.changed_by||"不明")+'</td><td class="admin-log">'+esc(diff)+'</td></tr>';
    }).join("");
  }
  async function load(){
    status("設定を読み込んでいます…");
    const {data,error}=await db.from("site_editor_settings").select("setting_value,updated_at,updated_by").eq("setting_key","site_theme").maybeSingle();
    if(error){console.error(error);status("設定を読み込めませんでした。通信・権限設定を確認してください。","error");fillForm(DEFAULTS);return;}
    saved={...DEFAULTS,...(data?.setting_value||{})}; fillForm(saved);
    $("editor-updated").textContent=data ? "最終更新: "+new Date(data.updated_at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})+" / 更新者ID: "+(data.updated_by||"不明") : "まだ保存済みのカスタム設定はありません。";
    status("設定を読み込みました。変更してプレビューできます。","ok");
    await loadHistory();
  }
  $("editor-form").addEventListener("submit",async e=>{
    e.preventDefault(); const value=readForm();
    status("設定を保存しています…");
    const {error}=await db.from("site_editor_settings").upsert({setting_key:"site_theme",setting_value:value,updated_by:userId,updated_at:new Date().toISOString()},{onConflict:"setting_key"});
    if(error){console.error(error);status(/row-level security|permission denied|not authorized/i.test(error.message||"")?"保存を拒否されました。管理者権限を確認してください。":"保存に失敗しました。しばらくしてから再度お試しください。","error");return;}
    saved={...value}; preview(value);
    $("editor-updated").textContent="最終更新: "+new Date().toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})+" / 更新者ID: "+userId;
    status("保存しました。サイト側の表示設定に反映されます。","ok");
    await loadHistory();
  });
  $("editor-preview-button").addEventListener("click",()=>{preview(readForm());status("プレビューを更新しました。保存はまだ行っていません。","ok");});
  ["announcement-body","terms-content","privacy-content"].forEach(id=>$(id).addEventListener("input",()=>{preview(readForm());}));
  $("editor-reset").addEventListener("click",()=>{fillForm(saved);status("最後に保存した設定へ戻しました。","ok");});
  (async()=>{if(await authorize()) await load();})();
})();