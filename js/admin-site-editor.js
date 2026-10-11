(() => {
  "use strict";
  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const $ = id => document.getElementById(id);
  const DEFAULTS = {
    brandName:"Kizimin", heroTitle:"好きなことを、\n好きなように書こう。", heroDescription:"Kiziminは、記事を読んだり、書いたりできる場所。",
    accentColor:"#111827", backgroundColor:"#f5f7fb", textColor:"#111827", cardRadius:14,
    showHero:true, showDaily:true, showPopular:true, showCategories:true, showDiscovery:true,
    showPolls:true, showChallenges:true, showQA:true, showLibrary:true
  };
  let userId = null, saved = {...DEFAULTS};
  const status = (message, kind="") => { const el=$("editor-status"); el.textContent=message; el.className="editor-status"+(kind?" "+kind:""); };
  function denied(message){ $("editor-loading").classList.add("hidden"); $("editor-app").classList.add("hidden"); $("editor-denied").classList.remove("hidden"); $("editor-denied-reason").textContent=message; }
  async function authorize(){
    const {data:{session},error}=await db.auth.getSession();
    if(error){denied("ログイン状態を確認できませんでした。");return false;}
    if(!session?.user?.id){location.href="login.html";return false;}
    userId=session.user.id;
    const {data:profile,error:profileError}=await db.from("profiles").select("role,account_status").eq("id",userId).maybeSingle();
    if(profileError){denied("管理者権限の確認に失敗しました。");return false;}
    const {data:owner,error:ownerError}=await db.rpc("is_site_owner");
    const allowed=profile?.role==="admin" || (!ownerError && owner===true);
    if(!allowed || (profile?.account_status && profile.account_status!=="active")){denied("この機能は管理者専用です。");return false;}
    $("editor-loading").classList.add("hidden"); $("editor-app").classList.remove("hidden");
    return true;
  }
  function readForm(){
    return {
      brandName:$("brand-name").value.trim().slice(0,60) || DEFAULTS.brandName,
      heroTitle:$("hero-title").value.slice(0,180),
      heroDescription:$("hero-description").value.slice(0,500),
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
    $("accent-color").value=x.accentColor; $("background-color").value=x.backgroundColor; $("text-color").value=x.textColor;
    $("card-radius").value=x.cardRadius;
    for(const [id,key] of [["show-hero","showHero"],["show-daily","showDaily"],["show-popular","showPopular"],["show-categories","showCategories"],["show-discovery","showDiscovery"],["show-polls","showPolls"],["show-challenges","showChallenges"],["show-qa","showQA"],["show-library","showLibrary"]]) $(id).checked=!!x[key];
    preview(x);
  }
  function preview(v){
    const x={...DEFAULTS,...v};
    $("preview-head").textContent=x.brandName; $("preview-title").textContent=x.heroTitle; $("preview-description").textContent=x.heroDescription;
    const p=$("editor-preview");
    p.style.setProperty("--preview-accent",x.accentColor); p.style.setProperty("--preview-bg",x.backgroundColor);
    p.style.setProperty("--preview-text",x.textColor); p.style.setProperty("--preview-radius",x.cardRadius+"px");
    $("preview-hero").hidden=!x.showHero; $("preview-popular").hidden=!x.showPopular; $("preview-categories").hidden=!x.showCategories;
    $("preview-community").hidden=!(x.showDaily||x.showPolls||x.showChallenges||x.showQA||x.showLibrary);
    $("preview-latest").style.borderRadius=x.cardRadius+"px";
  }
  async function load(){
    status("設定を読み込んでいます…");
    const {data,error}=await db.from("site_editor_settings").select("setting_value,updated_at,updated_by").eq("setting_key","site_theme").maybeSingle();
    if(error){console.error(error);status("設定を読み込めませんでした。通信・権限設定を確認してください。","error");fillForm(DEFAULTS);return;}
    saved={...DEFAULTS,...(data?.setting_value||{})}; fillForm(saved);
    $("editor-updated").textContent=data ? "最終更新: "+new Date(data.updated_at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})+" / 更新者ID: "+(data.updated_by||"不明") : "まだ保存済みのカスタム設定はありません。";
    status("設定を読み込みました。変更してプレビューできます。","ok");
  }
  $("editor-form").addEventListener("submit",async e=>{
    e.preventDefault(); const value=readForm();
    status("設定を保存しています…");
    const {error}=await db.from("site_editor_settings").upsert({setting_key:"site_theme",setting_value:value,updated_by:userId,updated_at:new Date().toISOString()},{onConflict:"setting_key"});
    if(error){console.error(error);status(/row-level security|permission denied|not authorized/i.test(error.message||"")?"保存を拒否されました。管理者権限を確認してください。":"保存に失敗しました。しばらくしてから再度お試しください。","error");return;}
    saved={...value}; preview(value);
    $("editor-updated").textContent="最終更新: "+new Date().toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})+" / 更新者ID: "+userId;
    status("保存しました。サイト側の表示設定に反映されます。","ok");
  });
  $("editor-preview-button").addEventListener("click",()=>{preview(readForm());status("プレビューを更新しました。保存はまだ行っていません。","ok");});
  $("editor-reset").addEventListener("click",()=>{fillForm(saved);status("最後に保存した設定へ戻しました。","ok");});
  (async()=>{if(await authorize()) await load();})();
})();