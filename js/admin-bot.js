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
  const defaultPolicy = { mode:"detect_only", threshold:3, window_hours:24, suspend_minutes:60, url_threshold:4, repeat_char_threshold:12, max_suspensions_per_run:3, enabled:false, interval_minutes:5, reports:true, inquiries:true, comments:true, articles:true };
  let policy = {...defaultPolicy}, policyLoaded = false;
  const storageKey = () => STORAGE_PREFIX + (userId || "unknown");
  function readConfig() {
    return {enabled:!!policy.enabled, intervalMinutes:Number(policy.interval_minutes)||5, reports:policy.reports!==false, inquiries:policy.inquiries!==false, comments:policy.comments!==false, articles:policy.articles!==false};
  }
  async function writeConfig(config) {
    if(!policyLoaded || !userId) { setStatus("Supabase設定の読み込み完了後に変更してください。","error"); return false; }
    policy={...policy,enabled:!!config.enabled,interval_minutes:Math.max(1,Math.min(60,Number(config.intervalMinutes)||5)),reports:!!config.reports,inquiries:!!config.inquiries,comments:!!config.comments,articles:!!config.articles};
    try {
      const {data,error}=await db.from("kizimin_bot_settings").update({settings:policy,updated_by:userId,updated_at:new Date().toISOString()}).eq("id",true).select("settings,updated_at").maybeSingle();
      if(error) throw error;
      if(!data) throw new Error("設定行が見つからないか、更新権限がありません。");
      policy={...defaultPolicy,...data.settings}; renderPolicy(); setStatus("設定をSupabaseに保存しました。","success"); return true;
    } catch(error) { setStatus("Supabaseへの設定保存に失敗しました: "+error.message,"error"); return false; }
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
    renderConfig();
    const updated=data.updated_at ? fmt(data.updated_at) : "更新日時不明";
    setStatus("Supabaseから保存済み設定を読み込みました（最終更新: "+updated+"）。","success");
  }
  function renderPolicy() {
    if(policyLoaded) {
      if($("bot-mode")) $("bot-mode").value=policy.mode==="auto_suspend"?"auto_suspend":"detect_only";
      if($("bot-threshold")) $("bot-threshold").value=String(Math.max(2,Math.min(10,Number(policy.threshold)||3)));
      if($("bot-window-hours")) $("bot-window-hours").value=String(Math.max(1,Math.min(168,Number(policy.window_hours)||24)));
      if($("bot-suspend-minutes")) $("bot-suspend-minutes").value=String(Math.max(15,Math.min(1440,Number(policy.suspend_minutes)||60)));
      if($("bot-url-threshold")) $("bot-url-threshold").value=String(Math.max(2,Math.min(6,Number(policy.url_threshold)||4)));
      if($("bot-repeat-char-threshold")) $("bot-repeat-char-threshold").value=String(Math.max(8,Math.min(30,Number(policy.repeat_char_threshold)||12)));
      if($("bot-max-suspensions")) $("bot-max-suspensions").value=String(Math.max(1,Math.min(10,Number(policy.max_suspensions_per_run)||3)));
      if($("bot-enabled")) $("bot-enabled").checked=!!policy.enabled;
      if($("bot-interval")) $("bot-interval").value=String(Math.max(1,Math.min(60,Number(policy.interval_minutes)||5)));
      for(const key of ["reports","inquiries","comments","articles"]) if($("bot-source-"+key)) $("bot-source-"+key).checked=policy[key]!==false;
      if($("bot-policy-summary")) $("bot-policy-summary").textContent="Supabase保存値: "+(policy.mode==="auto_suspend"?"自動一時停止":"検知のみ")+" / 判定 "+policy.threshold+"件 / "+policy.window_hours+"時間 / 停止 "+policy.suspend_minutes+"分 / URL "+policy.url_threshold+"件 / 連続文字 "+policy.repeat_char_threshold+"文字 / 1回上限 "+policy.max_suspensions_per_run+"件 / 管理画面自動チェック "+(policy.enabled?"ON":"OFF")+" / 間隔 "+(policy.interval_minutes||5)+"分 / 対象 "+["reports","inquiries","comments","articles"].filter(k=>policy[k]!==false).join("・")+"。自動一時停止の実動作にはRenderのBOT_AUTO_SUSPEND=trueも必要です。";
    }
    for(const id of ["bot-mode","bot-threshold","bot-window-hours","bot-suspend-minutes","bot-url-threshold","bot-repeat-char-threshold","bot-max-suspensions","bot-enabled","bot-interval","bot-source-reports","bot-source-inquiries","bot-source-comments","bot-source-articles"]) if($(id)) $(id).disabled=!policyLoaded;
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
        suspend_minutes:Math.max(15,Math.min(1440,Number($("bot-suspend-minutes")?.value)||60)),
        url_threshold:Math.max(2,Math.min(6,Number($("bot-url-threshold")?.value)||4)),
        repeat_char_threshold:Math.max(8,Math.min(30,Number($("bot-repeat-char-threshold")?.value)||12)),
        max_suspensions_per_run:Math.max(1,Math.min(10,Number($("bot-max-suspensions")?.value)||3)),
        enabled:!!$("bot-enabled")?.checked,
        interval_minutes:Math.max(1,Math.min(60,Number($("bot-interval")?.value)||5)),
        reports:!!$("bot-source-reports")?.checked,
        inquiries:!!$("bot-source-inquiries")?.checked,
        comments:!!$("bot-source-comments")?.checked,
        articles:!!$("bot-source-articles")?.checked
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
      setStatus(mode==="auto_suspend"?"Supabaseに自動一時停止設定を保存しました。実際の動作にはRender側の許可設定も必要です。":"Supabaseに検知のみ設定を保存しました。","success");
      renderPolicy();
    } catch(error) {
      const message="Bot設定を保存できませんでした: "+(error.message||"権限または通信状態を確認してください");
      setStatus(message,"error");
      console.error("[Kizimin Bot] settings save failed", error);
      $("bot-status")?.scrollIntoView({behavior:"smooth",block:"center"});
    } finally { if(button) button.disabled=false; }
  }
  function renderConfig() {
    if(!policyLoaded) { for(const id of ["bot-enabled","bot-interval","bot-source-reports","bot-source-inquiries","bot-source-comments","bot-source-articles"]) if($(id)) $(id).disabled=true; return; }
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
  // Lightweight availability scan: checks public pages only; it does not generate load.
  const SITE_PAGES = ["/account.html","/ai-assistant.html","/article.html","/contact.html","/dm.html","/edit-article.html","/index.html","/inquiry.html","/login.html","/my-articles.html","/new-article.html","/notifications.html","/oauth/consent.html","/organization.html","/pentest.html","/privacy.html","/profile.html","/terms.html","/write.html"];
  async function scanSiteAvailability(alerts, stats) {
    const results = [];
    const queue = [...SITE_PAGES];
    const worker = async () => {
      while (queue.length) {
        const path = queue.shift();
        const started = performance.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(new URL(path, location.origin).toString(), {
            method: "HEAD", cache: "no-store", credentials: "same-origin", signal: controller.signal
          });
          const ms = Math.round(performance.now() - started);
          results.push({path, status: response.status, ms});
          if (!response.ok) {
            addAlert(alerts, response.status >= 500 ? "high" : "review", "サイト監視",
              "ページ応答エラー", path + " · HTTP " + response.status + " · " + ms + "ms", path);
          } else if (ms >= 5000) {
            addAlert(alerts, "review", "サイト監視", "ページ応答が遅い",
              path + " · " + ms + "ms", path);
          }
        } catch (error) {
          const ms = Math.round(performance.now() - started);
          results.push({path, status: 0, ms, timeout: error.name === "AbortError"});
          addAlert(alerts, "high", "サイト監視", error.name === "AbortError" ? "ページ応答タイムアウト" : "ページ取得失敗",
            path + " · " + (error.name === "AbortError" ? "8秒以内に応答なし" : String(error.message || error)) , path);
        } finally { clearTimeout(timeout); }
      }
    };
    await Promise.all(Array.from({length: Math.min(4, queue.length)}, worker));
    stats.sitePagesChecked = results.length;
    stats.sitePageErrors = results.filter(x => x.status === 0 || x.status >= 400).length;
    const slowOrUnavailable = results.filter(x => x.status === 0 || x.status === 429 || x.status === 503 || x.status >= 500 || x.ms >= 8000).length;
    if (results.length >= 5 && slowOrUnavailable >= Math.max(3, Math.ceil(results.length * 0.4))) {
      addAlert(alerts, "high", "サイト監視", "サイト可用性の異常を検出",
        slowOrUnavailable + "/" + results.length + " ページで応答異常。DoS/DDoSの可能性を含みますが、障害・ホスティング停止・通信問題でも発生します。サーバー/CDN側のアクセスログ確認が必要です。");
    }
  }
  async function scan(reason="手動チェック") {
    if(scanInProgress) { setStatus("前回のチェックがまだ実行中です。完了を待っています。"); return; }
    scanInProgress=true;
    const button=$("bot-run-now"); if(button) button.disabled=true;
    try {
    setStatus(reason+"を実行しています…");
    const config=readConfig(), alerts=[], stats={reports:0,inquiries:0,suspiciousComments:0,suspiciousArticles:0,sitePagesChecked:0,sitePageErrors:0,errors:[]};
    const tasks=[];
    const activityByAuthor=new Map(), urlAuthors=new Map();
    const oneHourAgo=Date.now()-60*60*1000;
    const recordActivity=(authorId,createdAt,category)=> {
      if(!authorId||!createdAt||new Date(createdAt).getTime()<oneHourAgo)return;
      const id=String(authorId), entry=activityByAuthor.get(id)||{count:0,categories:new Set()};
      entry.count++;entry.categories.add(category);activityByAuthor.set(id,entry);
    };
    const collectUrls=(authorId,text,createdAt)=> {
      if(!authorId||!createdAt||new Date(createdAt).getTime()<oneHourAgo)return;
      const urls=String(text||"").match(/https?:\/\/[^\s<>"']+/gi)||[];
      for(const raw of urls){let normalized;try{const u=new URL(raw);normalized=u.hostname.toLowerCase()+u.pathname.replace(/\/$/,"");}catch{continue;}
        const authors=urlAuthors.get(normalized)||new Set();authors.add(String(authorId));urlAuthors.set(normalized,authors);
      }
    };
    if(config.reports) tasks.push((async()=>{try{
      const rows=await safeRead("reports","id,reason,status,created_at",100);
      stats.reports=rows.filter(r=>isOpen(r.status)).length;
      const stale=rows.filter(r=>isOpen(r.status)&&r.created_at&&Date.now()-new Date(r.created_at).getTime()>48*60*60*1000);
      stats.staleReports=stale.length;
      for(const r of stale.slice(0,10)) addAlert(alerts,"high","長期未対応","48時間以上未対応の通報",String(r.reason||"理由未記入").slice(0,140)+" · "+fmt(r.created_at),String(r.id));
      for(const r of rows.filter(r=>isOpen(r.status)).slice(0,15)) addAlert(alerts,"high","通報","未処理の通報があります",String(r.reason||"理由未記入").slice(0,180)+" · "+fmt(r.created_at),String(r.id));
    }catch(e){stats.errors.push("通報: "+e.message);}})());
    if(config.inquiries) tasks.push((async()=>{try{
      const rows=await safeRead("inquiries","id,subject,message,status,created_at",100);
      stats.inquiries=rows.filter(r=>isOpen(r.status)).length;
      const stale=rows.filter(r=>isOpen(r.status)&&r.created_at&&Date.now()-new Date(r.created_at).getTime()>48*60*60*1000);
      stats.staleInquiries=stale.length;
      for(const r of stale.slice(0,10)) addAlert(alerts,"medium","長期未対応","48時間以上未対応の問い合わせ",String(r.subject||"件名なし")+" · "+fmt(r.created_at),String(r.id));
      for(const r of rows.filter(r=>isOpen(r.status)).slice(0,15)) addAlert(alerts,"medium","問い合わせ","未対応の問い合わせ",String(r.subject||"件名なし")+" · "+String(r.message||"").slice(0,100)+" · "+fmt(r.created_at),String(r.id));
    }catch(e){stats.errors.push("問い合わせ: "+e.message);}})());
    if(config.comments) tasks.push((async()=>{try{
      const rows=await safeRead("comments","id,author_id,content,status,created_at",100);
      const seen=new Map();
      for(const r of rows){
        recordActivity(r.author_id,r.created_at,"コメント");
        collectUrls(r.author_id,r.content,r.created_at);
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
        recordActivity(r.author_id,r.created_at,"記事");
        collectUrls(r.author_id,[r.title,r.excerpt,r.content].filter(Boolean).join("\n"),r.created_at);
        const reasonText=inspectText([r.title,r.excerpt,r.content].filter(Boolean).join("\n"));
        if(reasonText){stats.suspiciousArticles++;addAlert(alerts,"review","記事","確認が必要な記事",reasonText+" · "+String(r.title||"タイトルなし").slice(0,120)+" · "+fmt(r.created_at),String(r.id));}
      }
    }catch(e){stats.errors.push("記事: "+e.message);}})());
    tasks.push((async()=>{try{
      const {data,error}=await db.from("profiles").select("id,created_at").gte("created_at",new Date(Date.now()-60*60*1000).toISOString()).order("created_at",{ascending:false}).limit(200);
      if(error)throw error;
      stats.newAccountsLastHour=(data||[]).length;
      if(stats.newAccountsLastHour>=5)addAlert(alerts,"review","アカウント監視","短時間の新規登録増加","過去1時間に"+stats.newAccountsLastHour+"件のアカウント登録がありました。正規の利用増加か確認してください。");
    }catch(e){stats.errors.push("アカウント監視: "+e.message);}})());
    await Promise.all(tasks);
    const frequentAuthors=[...activityByAuthor.entries()].filter(([,v])=>v.count>=8);
    stats.highActivityAuthors=frequentAuthors.length;
    for(const [authorId,v] of frequentAuthors.slice(0,10))addAlert(alerts,"review","投稿頻度監視","短時間の投稿集中", "過去1時間に"+v.count+"件の投稿（"+[...v.categories].join("・")+"）。自動処分せず確認してください。",authorId);
    const repeatedUrls=[...urlAuthors.entries()].filter(([,authors])=>authors.size>=3);
    stats.repeatedUrls=repeatedUrls.length;
    for(const [url,authors] of repeatedUrls.slice(0,10))addAlert(alerts,"review","URL監視","複数アカウントで同じURLを検出",url+" · "+authors.size+"アカウント");
    try { await scanSiteAvailability(alerts, stats); } catch(e) { stats.errors.push("サイト監視: "+e.message); }
    lastRunAt=new Date().toISOString();
    lastAlerts=alerts.sort((a,b)=>{const order={high:0,medium:1,review:2};return (order[a.level]??9)-(order[b.level]??9);});
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
      ["要確認コメント",stats.suspiciousComments,"review"],["要確認記事",stats.suspiciousArticles,"review"],["長期未対応",Number(stats.staleReports||0)+Number(stats.staleInquiries||0),"high"],["投稿集中",stats.highActivityAuthors||0,"review"],["同一URLの共有",stats.repeatedUrls||0,"review"],["新規登録（1時間）",stats.newAccountsLastHour||0,"medium"],["サイト応答異常",stats.sitePageErrors,"high"],["確認したページ",stats.sitePagesChecked,"medium"]
    ];
    if($("bot-kpis")) $("bot-kpis").innerHTML=kpis.map(([label,value,kind])=>'<div class="bot-kpi '+kind+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join("");
    renderAlertList();
    if($("bot-last-run")) $("bot-last-run").textContent=fmt(lastRunAt);
    if($("bot-run-summary")) $("bot-run-summary").textContent=reason+"：アラート "+alerts.length+" 件 / サイト確認 "+(stats.sitePagesChecked||0)+" ページ（応答異常 "+(stats.sitePageErrors||0)+" 件） / 読み込み失敗 "+stats.errors.length+" 件";
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
  function readHistory(){try{const x=JSON.parse(localStorage.getItem(storageKey()+":history")||"[]");return Array.isArray(x)?x:[];}catch{return[];}}
  function writeHistory(rows){try{localStorage.setItem(storageKey()+":history",JSON.stringify(rows));}catch{}}
  function renderHistory(){
    const el=$("bot-history");if(!el)return;
    const rows=readHistory();
    el.innerHTML=rows.length?rows.slice(0,12).map(r=>'<div class="bot-history-row"><span>'+esc(fmt(r.at))+'</span><strong>'+esc(r.reason)+'</strong><span>アラート '+esc(r.alerts)+' 件</span><span>エラー '+esc(r.errors)+' 件</span></div>').join(""):'<p class="bot-muted">まだ実行履歴はありません。</p>';
  }
  const withTimeout=(promise,label,ms=10000)=>Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+"が10秒以内に応答しませんでした。通信・Supabase認証・RLSを確認してください。")),ms))
  ]);
  async function authorize() {
    setStatus("Botのログイン状態を確認しています…");
    const sessionResult=await withTimeout(db.auth.getSession(),"Supabaseログイン確認");
    const session=sessionResult?.data?.session;
    if(sessionResult?.error) throw sessionResult.error;
    if(!session?.user?.id) throw new Error("ログインセッションがありません。管理画面に再ログインしてください。");
    userId=session.user.id;
    setStatus("Botの管理者権限を確認しています…");
    const profileResult=await withTimeout(
      db.from("profiles").select("role,account_status").eq("id",userId).maybeSingle(),
      "profiles権限確認"
    );
    if(profileResult.error) throw profileResult.error;
    const profile=profileResult.data;
    if(profile?.account_status && profile.account_status!=="active") throw new Error("このアカウントは現在利用停止中です。");
    if(profile?.role==="admin") return true;
    const ownerResult=await withTimeout(db.rpc("is_site_owner"),"オーナー権限RPC");
    if(ownerResult.error) throw ownerResult.error;
    if(ownerResult.data===true) return true;
    throw new Error("このアカウントには複合型Botを利用する管理者権限がありません。");
  }
  function bind() {
    const config=readConfig();
    $("bot-run-now")?.addEventListener("click",()=>scan("手動チェック"));
    $("bot-export-csv")?.addEventListener("click",()=>exportAlerts("csv"));
    $("bot-export-json")?.addEventListener("click",()=>exportAlerts("json"));
    $("bot-filter-level")?.addEventListener("change",renderAlertList);
    $("bot-filter-source")?.addEventListener("change",renderAlertList);
    $("bot-policy-save")?.addEventListener("click",savePolicy);
    $("bot-stop")?.addEventListener("click",()=>{
      const c=readConfig();c.enabled=false;void writeConfig(c);setRunning(false);renderConfig();
      setStatus("Botを停止しました。自動チェックは行いません。","success");
    });
    $("bot-enabled")?.addEventListener("change",()=>{
      const c=readConfig();c.enabled=$("bot-enabled").checked;
      void writeConfig(c);
      setRunning(c.enabled);
      setStatus(c.enabled?"Botを有効にしました。この管理画面を開いている間、自動チェックを行います。":"Botを停止しました。","success");
      if(c.enabled) scan("起動時チェック");
    });
    $("bot-interval")?.addEventListener("change",()=>{
      const c=readConfig();c.intervalMinutes=Math.max(1,Math.min(60,Number($("bot-interval").value)||5));
      void writeConfig(c);if(running)setRunning(true);
      setStatus("自動チェック間隔を保存しました。","success");
    });
    for(const key of ["reports","inquiries","comments","articles"]) $("bot-source-"+key)?.addEventListener("change",()=>{
      const c=readConfig();c[key]=$("bot-source-"+key).checked;
      void writeConfig(c);
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
    const nav=document.querySelector('.admin-nav [data-view="bot"]');
    try {
      const allowed=await authorize();
      if(!allowed){nav?.classList.add("hidden");$("view-bot")?.classList.add("hidden");return;}
      bind();
    } catch(error) {
      console.error("Bot権限確認失敗",error);
      setStatus("Botの権限確認に失敗しました: "+(error?.message||String(error)),"error");
      if(nav) nav.title="権限確認エラー。画面のBotステータスを確認してください。";
    }
  })();
  window.addEventListener("beforeunload",()=>{if(intervalId)clearInterval(intervalId);if(realtimeTimer)clearTimeout(realtimeTimer);if(realtimeChannel)db.removeChannel(realtimeChannel);});
})();