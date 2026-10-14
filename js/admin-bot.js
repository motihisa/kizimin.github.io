(() => {
  "use strict";
  const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
  const STORAGE_PREFIX = "kizimin_admin_bot_v1:";
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmt = value => value ? new Date(value).toLocaleString("ja-JP", {timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "日時不明";
  if (!$("view-bot") || !window.supabase?.createClient) return;
  const db = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY);
  let userId = null, intervalId = null, running = false, scanInProgress = false, lastAlerts = [], lastRunAt = null;
  const defaults = { enabled:false, intervalMinutes:5, reports:true, inquiries:true, comments:true, articles:true, browserNotice:false };
  const defaultPolicy = { mode:"detect_only", threshold:3, window_hours:24, suspend_minutes:60 };
  let policy = {...defaultPolicy};
  const storageKey = () => STORAGE_PREFIX + (userId || "unknown");
  function readConfig() {
    try { return {...defaults, ...JSON.parse(localStorage.getItem(storageKey()) || "{}")}; }
    catch { return {...defaults}; }
  }
  function writeConfig(config) {
    try { localStorage.setItem(storageKey(), JSON.stringify(config)); return true; }
    catch { setStatus("設定を保存できません。ブラウザーの保存領域を確認してください。", "error"); return false; }
  }
  function setStatus(message, type="info") {
    const el=$("bot-status"); if(!el)return;
    el.textContent=message; el.dataset.state=type;
  }
  async function loadPolicy() {
    const {data,error}=await db.from("kizimin_bot_settings").select("settings").eq("id",true).maybeSingle();
    if(error) throw new Error("Bot設定の読み込みに失敗しました: "+error.message);
    policy={...defaultPolicy,...(data?.settings||{})};
    renderPolicy();
  }
  function renderPolicy() {
    if($("bot-mode")) $("bot-mode").value=policy.mode==="auto_suspend"?"auto_suspend":"detect_only";
    if($("bot-threshold")) $("bot-threshold").value=String(Math.max(2,Math.min(10,Number(policy.threshold)||3)));
    if($("bot-window-hours")) $("bot-window-hours").value=String(Math.max(1,Math.min(168,Number(policy.window_hours)||24)));
    if($("bot-suspend-minutes")) $("bot-suspend-minutes").value=String(Math.max(15,Math.min(1440,Number(policy.suspend_minutes)||60)));
    if($("bot-policy-save")) $("bot-policy-save").disabled=false;
  }
  async function savePolicy() {
    const button=$("bot-policy-save");
    if(button) button.disabled=true;
    try {
      const mode=$("bot-mode")?.value==="auto_suspend"?"auto_suspend":"detect_only";
      const next={
        mode,
        threshold:Math.max(2,Math.min(10,Number($("bot-threshold")?.value)||3)),
        window_hours:Math.max(1,Math.min(168,Number($("bot-window-hours")?.value)||24)),
        suspend_minutes:Math.max(15,Math.min(1440,Number($("bot-suspend-minutes")?.value)||60))
      };
      if(mode==="auto_suspend"&&!confirm("自動一時停止を有効にします。条件に該当する一般ユーザーは自動で一時停止されます。続行しますか？")) return;
      const {error}=await db.from("kizimin_bot_settings").upsert({id:true,settings:next,updated_by:userId,updated_at:new Date().toISOString()},{onConflict:"id"});
      if(error) throw error;
      policy=next;
      setStatus(mode==="auto_suspend"?"設定を保存しました。自動一時停止はバックグラウンドBotの次回実行から適用されます。":"設定を保存しました。現在は検知のみで、一時停止は行いません。","success");
      renderPolicy();
    } catch(error) {
      setStatus("Bot設定を保存できませんでした: "+(error.message||"権限または通信状態を確認してください"),"error");
    } finally { if(button) button.disabled=false; }
  }
  function renderConfig() {
    const c=readConfig();
    if($("bot-enabled")) $("bot-enabled").checked=!!c.enabled;
    if($("bot-interval")) $("bot-interval").value=String(c.intervalMinutes);
    for(const key of ["reports","inquiries","comments","articles"]) if($("bot-source-"+key)) $("bot-source-"+key).checked=!!c[key];
    if($("bot-running-state")) {
      $("bot-running-state").textContent=running ? "稼働中" : "停止中";
      $("bot-running-state").classList.toggle("is-running",running);
    }
  }
  function setRunning(enabled) {
    if(intervalId) { clearInterval(intervalId); intervalId=null; }
    running=!!enabled;
    if(running) {
      const c=readConfig();
      intervalId=setInterval(() => scan("自動チェック"), Math.max(1, Number(c.intervalMinutes)||5)*60*1000);
    }
    renderConfig();
  }
  function addAlert(list, level, source, title, detail, id="") {
    list.push({level,source,title,detail,id,at:new Date().toISOString()});
  }
  const isOpen = status => ["open","pending","new","reviewing","未対応","確認中"].includes(String(status||"").toLowerCase());
  function inspectText(text) {
    const value=String(text||"").trim();
    if(!value) return null;
    const links=(value.match(/https?:\/\//gi)||[]).length;
    if(links>=4) return "URLが4件以上含まれています";
    if(/(.)\1{11,}/u.test(value)) return "同じ文字が過度に連続しています";
    if(/(?:無料で稼げる|必ず儲かる|当選しました|投資で確実|アカウント停止を回避|パスワードを送信)/i.test(value)) return "迷惑投稿で使われやすい表現を検出しました";
    if(value.length>1800 && links>=2) return "長文かつ複数URLを含みます";
    return null;
  }
  async function safeRead(table, columns, limit=100) {
    const {data,error}=await db.from(table).select(columns).order("created_at",{ascending:false}).limit(limit);
    if(error) throw new Error(error.message || table+"の読み込みに失敗しました");
    return data||[];
  }
  async function scan(reason="手動チェック") {
    if(scanInProgress) { setStatus("前回のチェックがまだ実行中です。完了を待っています。"); return; }
    scanInProgress=true;
    const button=$("bot-run-now"); if(button) button.disabled=true;
    setStatus(reason+"を実行しています…");
    const config=readConfig(), alerts=[], stats={reports:0,inquiries:0,suspiciousComments:0,suspiciousArticles:0,errors:[]};
    const tasks=[];
    if(config.reports) tasks.push((async()=>{try{
      const rows=await safeRead("reports","id,reason,status,created_at",100);
      stats.reports=rows.filter(r=>isOpen(r.status)).length;
      for(const r of rows.filter(r=>isOpen(r.status)).slice(0,15)) addAlert(alerts,"high","通報","未処理の通報があります",String(r.reason||"理由未記入").slice(0,180)+" · "+fmt(r.created_at),String(r.id));
    }catch(e){stats.errors.push("通報: "+e.message);}})());
    if(config.inquiries) tasks.push((async()=>{try{
      const rows=await safeRead("inquiries","id,subject,message,status,created_at",100);
      stats.inquiries=rows.filter(r=>isOpen(r.status)).length;
      for(const r of rows.filter(r=>isOpen(r.status)).slice(0,15)) addAlert(alerts,"medium","問い合わせ","未対応の問い合わせ",String(r.subject||"件名なし")+" · "+String(r.message||"").slice(0,100)+" · "+fmt(r.created_at),String(r.id));
    }catch(e){stats.errors.push("問い合わせ: "+e.message);}})());
    if(config.comments) tasks.push((async()=>{try{
      const rows=await safeRead("comments","id,author_id,content,status,created_at",100);
      const seen=new Map();
      for(const r of rows){
        const text=String(r.content||"");
        const reasonText=inspectText(text);
        const fingerprint=text.toLowerCase().replace(/\s+/g," ").trim();
        const repeated=fingerprint.length>=20&&seen.has(fingerprint);
        if(fingerprint.length>=20&&!seen.has(fingerprint)) seen.set(fingerprint,r);
        if(reasonText||repeated){
          stats.suspiciousComments++;
          addAlert(alerts,"review","コメント",repeated?"類似したコメントを検出":"確認が必要なコメント",repeated?"別のコメントと本文が一致しています":reasonText+" · "+text.slice(0,130),String(r.id));
        }
      }
    }catch(e){stats.errors.push("コメント: "+e.message);}})());
    if(config.articles) tasks.push((async()=>{try{
      const rows=await safeRead("articles","id,title,excerpt,content,status,created_at",100);
      for(const r of rows){
        const reasonText=inspectText([r.title,r.excerpt,r.content].filter(Boolean).join("\n"));
        if(reasonText){stats.suspiciousArticles++;addAlert(alerts,"review","記事","確認が必要な記事",reasonText+" · "+String(r.title||"タイトルなし").slice(0,120)+" · "+fmt(r.created_at),String(r.id));}
      }
    }catch(e){stats.errors.push("記事: "+e.message);}})());
    await Promise.all(tasks);
    lastRunAt=new Date().toISOString();
    lastAlerts=alerts.sort((a,b)=>({high:0,medium:1,review:2}[a.level]-({high:0,medium:1,review:2}[b.level])));
    renderResults(stats,alerts,reason);
    const history=readHistory();
    history.unshift({at:lastRunAt,reason,alerts:alerts.length,errors:stats.errors.length,summary:stats});
    writeHistory(history.slice(0,30));
    if(stats.errors.length) setStatus("チェックは終了しました。一部の項目を取得できませんでした: "+stats.errors.join(" / "),"error");
    else setStatus("チェック完了 · "+fmt(lastRunAt),"success");
    scanInProgress=false; if(button) button.disabled=false;
  }
  function renderResults(stats,alerts,reason) {
    const kpis=[
      ["未処理の通報",stats.reports,"high"],["未対応の問い合わせ",stats.inquiries,"medium"],
      ["要確認コメント",stats.suspiciousComments,"review"],["要確認記事",stats.suspiciousArticles,"review"]
    ];
    if($("bot-kpis")) $("bot-kpis").innerHTML=kpis.map(([label,value,kind])=>'<div class="bot-kpi '+kind+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join("");
    if($("bot-alert-list")) $("bot-alert-list").innerHTML=alerts.length?alerts.slice(0,80).map(a=>'<article class="bot-alert '+esc(a.level)+'"><div class="bot-alert-head"><span class="bot-alert-source">'+esc(a.source)+'</span><strong>'+esc(a.title)+'</strong></div><p>'+esc(a.detail)+'</p></article>').join(""):'<div class="bot-empty">今回のチェックでアラートは見つかりませんでした。</div>';
    if($("bot-last-run")) $("bot-last-run").textContent=fmt(lastRunAt);
    if($("bot-run-summary")) $("bot-run-summary").textContent=reason+"：アラート "+alerts.length+" 件 / 読み込み失敗 "+stats.errors.length+" 件";
    renderHistory();
  }
  function readHistory(){try{const x=JSON.parse(localStorage.getItem(storageKey()+":history")||"[]");return Array.isArray(x)?x:[];}catch{return[];}}
  function writeHistory(rows){try{localStorage.setItem(storageKey()+":history",JSON.stringify(rows));}catch{}}
  function renderHistory(){
    const el=$("bot-history");if(!el)return;
    const rows=readHistory();
    el.innerHTML=rows.length?rows.slice(0,12).map(r=>'<div class="bot-history-row"><span>'+esc(fmt(r.at))+'</span><strong>'+esc(r.reason)+'</strong><span>アラート '+esc(r.alerts)+' 件</span><span>エラー '+esc(r.errors)+' 件</span></div>').join(""):'<p class="bot-muted">まだ実行履歴はありません。</p>';
  }
  async function authorize() {
    const {data:{session},error:sessionError}=await db.auth.getSession();
    if(sessionError||!session?.user?.id) return false;
    userId=session.user.id;
    const [{data:profile,error:profileError},{data:ownerFlag,error:ownerError}]=await Promise.all([
      db.from("profiles").select("role,account_status").eq("id",userId).maybeSingle(),
      db.rpc("is_site_owner")
    ]);
    if(profileError||(!profile&&!(!ownerError&&ownerFlag===true))) return false;
    const isOwner=!ownerError&&ownerFlag===true;
    if(profile?.account_status&&profile.account_status!=="active") return false;
    return isOwner||profile?.role==="admin";
  }
  function bind() {
    const config=readConfig();
    $("bot-run-now")?.addEventListener("click",()=>scan("手動チェック"));
    $("bot-policy-save")?.addEventListener("click",savePolicy);
    $("bot-stop")?.addEventListener("click",()=>{
      const c=readConfig();c.enabled=false;writeConfig(c);setRunning(false);renderConfig();
      setStatus("Botを停止しました。自動チェックは行いません。","success");
    });
    $("bot-enabled")?.addEventListener("change",()=>{
      const c=readConfig();c.enabled=$("bot-enabled").checked;
      if(!writeConfig(c)){renderConfig();return;}
      setRunning(c.enabled);
      setStatus(c.enabled?"Botを有効にしました。この管理画面を開いている間、自動チェックを行います。":"Botを停止しました。","success");
      if(c.enabled) scan("起動時チェック");
    });
    $("bot-interval")?.addEventListener("change",()=>{
      const c=readConfig();c.intervalMinutes=Math.max(1,Math.min(60,Number($("bot-interval").value)||5));
      writeConfig(c);if(running)setRunning(true);
      setStatus("自動チェック間隔を保存しました。","success");
    });
    for(const key of ["reports","inquiries","comments","articles"]) $("bot-source-"+key)?.addEventListener("change",()=>{
      const c=readConfig();c[key]=$("bot-source-"+key).checked;
      writeConfig(c);setStatus("チェック対象を保存しました。","success");
    });
    $("bot-clear-history")?.addEventListener("click",()=>{
      if(!confirm("このブラウザーに保存したBot履歴を削除しますか？"))return;
      writeHistory([]);renderHistory();setStatus("このブラウザーのBot履歴を削除しました。");
    });
    const nav=document.querySelector('.admin-nav [data-view="bot"]');
    nav?.addEventListener("click",()=>{
      $("view-bot")?.classList.remove("hidden");
      $("view-bot")?.classList.add("active");
      $("admin-view-title").textContent="複合型Bot";
      $("admin-view-subtitle").textContent="通報・問い合わせ・投稿の確認を自動化します。";
      renderConfig();renderHistory();
    });
    document.querySelectorAll('.admin-nav [data-view]:not([data-view="bot"])').forEach(button=>button.addEventListener("click",()=>{
      $("view-bot")?.classList.remove("active");
    }));
    renderConfig();renderHistory();
    loadPolicy().catch(error=>setStatus(error.message,"error"));
    if(config.enabled) { setRunning(true); scan("起動時チェック"); }
  }
  (async()=>{
    const allowed=await authorize();
    const nav=document.querySelector('.admin-nav [data-view="bot"]');
    if(!allowed){nav?.classList.add("hidden");$("view-bot")?.classList.add("hidden");return;}
    bind();
  })().catch(error=>{console.error("Bot権限確認失敗",error);document.querySelector('.admin-nav [data-view="bot"]')?.classList.add("hidden");setStatus("Botの権限確認に失敗しました。再読み込みしてください。","error");});
  window.addEventListener("beforeunload",()=>{if(intervalId)clearInterval(intervalId);});
})();