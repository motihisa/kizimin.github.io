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
  let userId = null, intervalId = null, running = false, scanInProgress = false, pendingRealtimeScan = false, realtimeChannel = null, realtimeTimer = null, lastAlerts = [], lastRunAt = null;
  const defaults = { enabled:false, intervalMinutes:5, reports:true, inquiries:true, comments:true, articles:true };
  const defaultPolicy = { mode:"detect_only", threshold:3, window_hours:24, suspend_minutes:60 };
  let policy = {...defaultPolicy}, policyLoaded = false;
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
    setStatus("SupabaseからバックグラウンドBot設定を読み込んでいます…");
    const {data,error}=await db.from("kizimin_bot_settings").select("settings,updated_at").eq("id",true).maybeSingle();
    if(error) throw new Error("Bot設定の読み込みに失敗しました: "+error.message);
    if(!data?.settings || typeof data.settings !== "object") throw new Error("SupabaseのBot設定行が見つかりません。初期値で上書きせず、保存を停止しました。");
    policy={...defaultPolicy,...data.settings};
    policyLoaded=true;
    renderPolicy();
    setStatus("Supabaseから保存済みのバックグラウンドBot設定を読み込みました。","success");
  }
  function renderPolicy() {
    if(policyLoaded) {
      if($("bot-mode")) $("bot-mode").value=policy.mode==="auto_suspend"?"auto_suspend":"detect_only";
      if($("bot-threshold")) $("bot-threshold").value=String(Math.max(2,Math.min(10,Number(policy.threshold)||3)));
      if($("bot-window-hours")) $("bot-window-hours").value=String(Math.max(1,Math.min(168,Number(policy.window_hours)||24)));
      if($("bot-suspend-minutes")) $("bot-suspend-minutes").value=String(Math.max(15,Math.min(1440,Number(policy.suspend_minutes)||60)));
    }
    for(const id of ["bot-mode","bot-threshold","bot-window-hours","bot-suspend-minutes"]) if($(id)) $(id).disabled=!policyLoaded;
    if($("bot-policy-save")) $("bot-policy-save").disabled=!policyLoaded;
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
      if(mode==="auto_suspend"&&!confirm("自動一時停止を有効にします。条件に該当する一般ユーザーは自動で一時停止されます。続行しますか？")) { setStatus("保存をキャンセルしました。設定は変更されていません。"); return; }
      if(!userId) throw new Error("ログイン状態を確認できません。管理画面に再ログインしてください。");
      setStatus("Bot設定を保存しています…");
      // The settings row is provisioned in advance. Update it directly so a normal save
      // does not need INSERT privileges through an upsert conflict path.
      const {data,error}=await db.from("kizimin_bot_settings")
        .update({settings:next,updated_by:userId,updated_at:new Date().toISOString()})
        .eq("id",true)
        .select("id,settings")
        .maybeSingle();
      if(error) throw error;
      if(!data) throw new Error("保存対象が見つからないか、保存権限がありません。Supabaseの管理者ポリシーを確認してください。");
      policy={...defaultPolicy,...(data.settings||next)};
      setStatus(mode==="auto_suspend"?"管理画面の設定を保存しました。実際の自動一時停止にはRender環境変数 BOT_AUTO_SUSPEND=true も必要です。":"設定を保存しました。現在は検知のみで、一時停止は行いません。","success");
      renderPolicy();
    } catch(error) {
      const message="Bot設定を保存できませんでした: "+(error.message||"権限または通信状態を確認してください");
      setStatus(message,"error");
      console.error("[Kizimin Bot] settings save failed", error);
      $("bot-status")?.scrollIntoView({behavior:"smooth",block:"center"});
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
  async function safeRead(table, columns, limit=100, filters={}) {
    let query=db.from(table).select(columns).order("created_at",{ascending:false}).limit(limit);
    for(const [column,value] of Object.entries(filters)) query=query.eq(column,value);
    const {data,error}=await query;
    if(error) throw new Error(error.message || table+"の読み込みに失敗しました");
    return data||[];
  }
  async function scan(reason="手動チェック") {
    if(scanInProgress) { setStatus("前回のチェックがまだ実行中です。完了を待っています。"); return; }
    scanInProgress=true;
    const button=$("bot-run-now"); if(button) button.disabled=true;
    try {
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
      const rows=await safeRead("articles","id,title,excerpt,content,status,created_at",100,{status:"visible"});
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
    } catch(error) {
      console.error("[Kizimin Bot] scan failed", error);
      setStatus("チェック中に予期しないエラーが発生しました。履歴と結果の表示を確認してください。","error");
    } finally {
      scanInProgress=false;
      if(button) button.disabled=false;
      if(pendingRealtimeScan) {
        pendingRealtimeScan=false;
        setTimeout(()=>scan("Supabase Realtime更新"),250);
      }
    }
  }
  function scheduleRealtimeScan() {
    if(realtimeTimer) clearTimeout(realtimeTimer);
    realtimeTimer=setTimeout(()=>{
      realtimeTimer=null;
      if(scanInProgress) { pendingRealtimeScan=true; return; }
      scan("Supabase Realtime更新");
    },700);
  }
  function startRealtime() {
    if(realtimeChannel) return;
    realtimeChannel=db.channel("kizimin-admin-bot-live-v1");
    for(const table of ["reports","inquiries","comments","articles"]) {
      realtimeChannel.on("postgres_changes",{event:"*",schema:"public",table},()=>{
        scheduleRealtimeScan();
      });
    }
    realtimeChannel.on("postgres_changes",{event:"*",schema:"public",table:"kizimin_bot_settings"},()=>{
      loadPolicy().catch(error=>{
        policyLoaded=false;
        renderPolicy();
        setStatus("Bot設定のリアルタイム更新に失敗しました: "+error.message,"error");
      });
    });
    realtimeChannel.subscribe(status=>{
      if(status==="SUBSCRIBED") {
        setStatus("Supabase Realtime接続済み。通報・問い合わせ・コメント・記事の変更を自動反映します。","success");
      } else if(status==="CHANNEL_ERROR" || status==="TIMED_OUT" || status==="CLOSED") {
        setStatus("Supabase Realtimeに接続できません。Supabase側のRealtime公開設定と権限を確認してください。手動チェックは引き続き利用できます。","error");
        console.warn("[Kizimin Bot] Realtime subscription status:",status);
      }
    });
  }
  function renderResults(stats,alerts,reason) {
    const kpis=[
      ["未処理の通報",stats.reports,"high"],["未対応の問い合わせ",stats.inquiries,"medium"],
      ["要確認コメント",stats.suspiciousComments,"review"],["要確認記事",stats.suspiciousArticles,"review"]
    ];
    if($("bot-kpis")) $("bot-kpis").innerHTML=kpis.map(([label,value,kind])=>'<div class="bot-kpi '+kind+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join("");
    renderAlertList();
    if($("bot-last-run")) $("bot-last-run").textContent=fmt(lastRunAt);
    if($("bot-run-summary")) $("bot-run-summary").textContent=reason+"：アラート "+alerts.length+" 件 / 読み込み失敗 "+stats.errors.length+" 件";
    renderHistory();
  }
  function renderAlertList() {
    const el=$("bot-alert-list");
    if(!el)return;
    const level=$("bot-filter-level")?.value||"all";
    const source=$("bot-filter-source")?.value||"all";
    const rows=lastAlerts.filter(a=>(level==="all"||a.level===level)&&(source==="all"||a.source===source));
    el.innerHTML=rows.length?rows.slice(0,80).map(a=>'<article class="bot-alert '+esc(a.level)+'"><div class="bot-alert-head"><span class="bot-alert-source">'+esc(a.source)+'</span><strong>'+esc(a.title)+'</strong><span class="bot-alert-level">'+esc(({high:"高",medium:"中",review:"要確認"})[a.level]||a.level)+'</span></div><p>'+esc(a.detail)+'</p></article>').join(""):'<div class="bot-empty">選択した条件に一致するアラートはありません。</div>';
    if($("bot-filter-count")) $("bot-filter-count").textContent=rows.length+" / "+lastAlerts.length+" 件を表示";
  }
  function exportAlerts(format) {
    const rows=lastAlerts.map(a=>({検出日時:a.at||lastRunAt||"",重要度:a.level||"",対象:a.source||"",タイトル:a.title||"",詳細:a.detail||"",対象ID:a.id||""}));
    if(!rows.length){setStatus("出力するアラートがありません。先にチェックを実行してください。","error");return;}
    let content,type,extension;
    if(format==="csv"){
      const keys=Object.keys(rows[0]);
      const quote=value=>'"'+String(value??"").replace(/"/g,'""')+'"';
      content="\uFEFF"+[keys.map(quote).join(","),...rows.map(row=>keys.map(key=>quote(row[key])).join(","))].join("\r\n");
      type="text/csv;charset=utf-8";extension="csv";
    }else{
      content=JSON.stringify({generatedAt:lastRunAt, count:rows.length, alerts:rows},null,2);
      type="application/json;charset=utf-8";extension="json";
    }
    const blob=new Blob([content],{type});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download="kizimin-bot-alerts-"+new Date().toISOString().replace(/[:.]/g,"-")+"."+extension;
    document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
    setStatus(format==="csv"?"アラートをCSVで出力しました。":"アラートをJSONで出力しました。","success");
  }
  async function notifyDiscord() {
    const button=$("bot-notify-discord");if(button)button.disabled=true;
    try{
      const {data:{session},error:sessionError}=await db.auth.getSession();
      if(sessionError||!session?.access_token)throw new Error("ログインセッションを確認できません。再ログインしてください。");
      setStatus("DiscordへBotの検知概要を送信しています…");
      const response=await fetch("https://kizimin-site.onrender.com/api/bot/notify",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},
        body:JSON.stringify({generatedAt:lastRunAt,alerts:lastAlerts.slice(0,10).map(a=>({level:a.level,source:a.source,title:a.title}))})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||("通知APIエラー: HTTP "+response.status));
      setStatus("Discordへ通知しました。","success");
    }catch(error){
      setStatus("Discord通知に失敗しました: "+(error.message||"接続設定を確認してください"),"error");
      console.error("[Kizimin Bot] Discord notification failed",error);
    }finally{if(button)button.disabled=false;}
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
    const isOwner=!ownerError && ownerFlag===true;
    if(profileError) return false;
    if(!profile && !isOwner) return false;
    if(profile?.account_status && profile.account_status!=="active") return false;
    return isOwner || profile?.role==="admin";
  }
  function bind() {
    const config=readConfig();
    $("bot-run-now")?.addEventListener("click",()=>scan("手動チェック"));
    $("bot-export-csv")?.addEventListener("click",()=>exportAlerts("csv"));
    $("bot-export-json")?.addEventListener("click",()=>exportAlerts("json"));
    $("bot-notify-discord")?.addEventListener("click",notifyDiscord);
    $("bot-filter-level")?.addEventListener("change",renderAlertList);
    $("bot-filter-source")?.addEventListener("change",renderAlertList);
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
    renderPolicy();
    loadPolicy().catch(error=>{policyLoaded=false;renderPolicy();setStatus(error.message+" 保存済み設定を確認できないため、設定変更を無効にしました。","error");});
    startRealtime();
    if(config.enabled) { setRunning(true); scan("起動時チェック"); }
    else scan("初回チェック");
  }
  (async()=>{
    const allowed=await authorize();
    const nav=document.querySelector('.admin-nav [data-view="bot"]');
    if(!allowed){nav?.classList.add("hidden");$("view-bot")?.classList.add("hidden");return;}
    bind();
  })().catch(error=>{console.error("Bot権限確認失敗",error);document.querySelector('.admin-nav [data-view="bot"]')?.classList.add("hidden");setStatus("Botの権限確認に失敗しました。再読み込みしてください。","error");});
  window.addEventListener("beforeunload",()=>{if(intervalId)clearInterval(intervalId);if(realtimeTimer)clearTimeout(realtimeTimer);if(realtimeChannel)db.removeChannel(realtimeChannel);});
})();