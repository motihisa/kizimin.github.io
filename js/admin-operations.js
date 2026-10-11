(() => {
"use strict";
const $ = id => document.getElementById(id);
const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
const KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
const db = window.supabase.createClient(SUPABASE_URL, KEY);
let sessionUser = null, role = "user", lastStats = {}, lastHealth = "未実行";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date = s => s ? new Date(s).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}) : "未記録";
const showDenied = msg => { $("ops-loading").classList.add("hidden"); $("ops-denied").classList.remove("hidden"); $("ops-denied-reason").textContent = msg; };
const readTasks = () => { try { const v=JSON.parse(localStorage.getItem("kizimin_admin_ops_tasks_v1")||"[]"); return Array.isArray(v)?v:[]; } catch { return []; } };
const writeTasks = v => { try { localStorage.setItem("kizimin_admin_ops_tasks_v1",JSON.stringify(v)); return true; } catch { return false; } };
function download(name, body, type="text/plain;charset=utf-8") { const u=URL.createObjectURL(new Blob([body],{type})); const a=document.createElement("a"); a.href=u; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(u),1000); }
async function guard() {
 try {
  const {data:{session},error:sessionError}=await db.auth.getSession();
  if(sessionError||!session?.user?.id) return showDenied("ログインセッションを確認できません。管理画面からログインしてください。");
  sessionUser=session.user;
  let isOwner=false, ownerCheckError=null;
  const {data:ownerFlag,error:ownerError}=await db.rpc("is_site_owner");
  if(!ownerError && ownerFlag===true) isOwner=true; else if(ownerError) ownerCheckError=ownerError;
  if(!isOwner) {
   const {data:ownerRow,error:ownerRowError}=await db.from("site_owners").select("user_id").eq("user_id",session.user.id).maybeSingle();
   if(!ownerRowError && ownerRow?.user_id===session.user.id) isOwner=true; else if(ownerRowError) ownerCheckError=ownerRowError;
  }
  const {data:p,error:pe}=await db.from("profiles").select("role,account_status").eq("id",session.user.id).maybeSingle();
  if(pe && !isOwner) { console.error("運営ツール: 権限確認失敗",pe,ownerCheckError); return showDenied("プロフィールの権限確認に失敗しました。"); }
  if(!p && !isOwner) return showDenied("プロフィールが取得できず、オーナー確認にも失敗しました。");
  if(p?.account_status && p.account_status!=="active") return showDenied("このアカウントは利用できません。");
  if(!isOwner && !["admin","moderator"].includes(p?.role)) return showDenied("管理者またはオーナーのみ利用できます。");
  role=isOwner?"owner":p.role;
  $("ops-loading").classList.add("hidden"); $("ops-app").classList.remove("hidden"); $("ops-auth-state").textContent=role;
 } catch(e) { console.error(e); showDenied("管理者権限の確認に失敗しました。"); }
}
function renderTasks() {
 const items=readTasks();
 $("ops-task-list").innerHTML=items.length?items.map(t=>'<div class="ops-item"><div><strong>'+esc(t.title)+'</strong><small>優先度：'+esc(t.priority)+' · 担当：'+esc(t.owner||"未指定")+' · 期限：'+esc(t.due||"未指定")+' · '+esc(t.status)+'</small></div><button class="admin-btn" type="button" data-task-toggle="'+esc(t.id)+'">'+(t.status==="完了"?"未完了に戻す":"完了")+'</button><button class="admin-btn danger" type="button" data-task-delete="'+esc(t.id)+'">削除</button></div>').join(""):'<p class="ops-note">引き継ぎタスクはありません。</p>';
}
function perf() {
 const n=performance.getEntriesByType("navigation")[0], ms=n?Math.round(n.loadEventEnd||n.duration):0;
 $("ops-page-time").textContent=ms?String(ms):"計測中";
}
async function count(table, apply) {
 let q=db.from(table).select("*",{count:"exact",head:true}); if(apply) q=apply(q);
 const {count,error}=await q; if(error) throw new Error(error.message); return count??0;
}
async function read(table, columns) {
 const {data,error}=await db.from(table).select(columns); if(error) throw new Error(error.message); return data||[];
}
function renderAlerts(items) {
 $("ops-alerts").innerHTML=items.length?items.map(a=>'<div class="ops-item"><div><strong>'+esc(a.title)+'</strong><small>'+esc(a.detail)+'</small></div><span class="admin-badge">'+esc(a.level)+'</span></div>').join(""):'<p class="ops-note">現在、読み取り可能な範囲でアラートはありません。</p>';
}
async function refreshData() {
 perf();
 const alerts=[], errors=[];
 const safe = async (name,fn) => { try { const v=await fn(); lastStats[name]=v; return v; } catch(e) { errors.push(name+"："+e.message); lastStats[name]=null; return null; } };
 const [users,articles,visits,reports,inquiries,settings,comments] = await Promise.all([
  safe("ユーザー数",()=>count("profiles")),
  safe("記事数",()=>count("articles")),
  safe("アクセスログ数",()=>count("access_logs")),
  safe("未解決通報数",()=>count("reports",q=>q.not("status","in",'("resolved","dismissed")'))),
  safe("未対応問い合わせ数",()=>count("inquiries",q=>q.not("status","in",'("resolved","dismissed")'))),
  safe("サイト設定",()=>read("site_settings","id,maintenance_mode,updated_at")),
  safe("コメント数",()=>count("comments"))
 ]);
 $("ops-db-kpis").innerHTML=[["ユーザー",users],["記事",articles],["アクセスログ",visits],["コメント",comments]].map(([n,v])=>'<div class="ops-kpi"><strong>'+esc(v===null?"取得不可":v)+'</strong><span>'+esc(n)+'</span></div>').join("");
 if(Array.isArray(settings)&&settings.length) $("ops-maintenance-state").textContent=settings[0].maintenance_mode?"有効":"無効";
 else $("ops-maintenance-state").textContent="取得不可";
 if(typeof reports==="number"&&reports>0) alerts.push({title:"未解決の通報",detail:"対応が必要な通報が "+reports+" 件あります。管理画面の通報欄を確認してください。",level:"要確認"});
 if(typeof inquiries==="number"&&inquiries>0) alerts.push({title:"未対応の問い合わせ",detail:"未対応の問い合わせが "+inquiries+" 件あります。",level:"要確認"});
 if(errors.length) alerts.push({title:"一部データにアクセスできません",detail:errors.join(" / "),level:"注意"});
 if(users===null||articles===null||visits===null) alerts.push({title:"運営統計が一部未取得",detail:"権限（RLS）または通信エラーのため、取得できた項目だけを表示しています。",level:"注意"});
 renderAlerts(alerts);
}
$("ops-task-form").addEventListener("submit",e=>{e.preventDefault();const title=$("ops-task-title").value.trim();if(!title)return;const a=readTasks();a.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),title,priority:$("ops-task-priority").value,owner:$("ops-task-owner").value.trim(),due:$("ops-task-due").value,status:"未完了",createdAt:new Date().toISOString()});if(!writeTasks(a))return alert("このブラウザに保存できませんでした。");e.target.reset();renderTasks();});
$("ops-task-list").addEventListener("click",e=>{const t=e.target.closest("[data-task-toggle]"),d=e.target.closest("[data-task-delete]");let a=readTasks();if(t)a=a.map(x=>x.id===t.dataset.taskToggle?{...x,status:x.status==="完了"?"未完了":"完了"}:x);else if(d){if(!confirm("このブラウザ内のタスクを削除しますか？"))return;a=a.filter(x=>x.id!==d.dataset.taskDelete)}else return;if(!writeTasks(a))alert("保存に失敗しました。");renderTasks();});
$("ops-export-tasks").addEventListener("click",()=>{const rows=[["内容","優先度","担当","期限","状態","作成日時"],...readTasks().map(t=>[t.title,t.priority,t.owner,t.due,t.status,t.createdAt])];download("kizimin-handover-tasks.csv","\ufeff"+rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n"),"text/csv;charset=utf-8");});
$("ops-report-export").addEventListener("click",()=>{
 const report={title:"Kizimin 運営レポート",generatedAt:new Date().toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}),role,statistics:lastStats,alerts:$("ops-alerts").innerText,siteDiagnosis:lastHealth,handoverTasks:readTasks(),limitations:["RLSで参照できないデータは含まれません","サイト診断は読み取り専用です","引き継ぎタスクはこのブラウザ内に保存されています"]};
 const safe=v=>esc(typeof v==="string"?v:JSON.stringify(v,null,2)??"未取得");
 const rows=Object.entries(report.statistics).map(([k,v])=>'<tr><th>'+esc(k)+'</th><td>'+safe(v)+'</td></tr>').join("");
 const tasks=report.handoverTasks.map(t=>'<tr><td>'+esc(t.title)+'</td><td>'+esc(t.priority)+'</td><td>'+esc(t.owner||"未指定")+'</td><td>'+esc(t.due||"未指定")+'</td><td>'+esc(t.status)+'</td></tr>').join("");
 const html='<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Kizimin 運営レポート</title><style>body{font-family:Arial,"Noto Sans JP",sans-serif;color:#172033;margin:28px;line-height:1.5}h1{font-size:24px;border-bottom:3px solid #334155;padding-bottom:10px}h2{font-size:16px;margin-top:24px;background:#eef2f7;padding:8px}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f8fafc;border:1px solid #e2e8f0;padding:10px}button{padding:10px 16px;margin-bottom:16px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">PDFとして保存 / 印刷</button><h1>Kizimin 運営レポート</h1><p>生成日時：'+esc(report.generatedAt)+'　権限：'+esc(role)+'</p><h2>運営状況</h2><table><tr><th>項目</th><th>値</th></tr>'+rows+'</table><h2>アラート</h2><pre>'+esc(report.alerts)+'</pre><h2>サイト診断</h2><pre>'+esc(report.siteDiagnosis)+'</pre><h2>引き継ぎタスク</h2><table><tr><th>タスク</th><th>優先度</th><th>担当</th><th>期限</th><th>状態</th></tr>'+tasks+'</table><h2>注意事項</h2><pre>'+esc(report.limitations.join("\n"))+'</pre></body></html>';
 const w=window.open("","_blank");if(!w){$("ops-report-status").textContent="ポップアップがブロックされました。許可してから再試行してください。";return;}w.document.open();w.document.write(html);w.document.close();$("ops-report-status").textContent="レポートを開きました。印刷画面でPDF保存できます。";
});
function classifyError(message){const m=String(message||"").toLowerCase();if(/401|invalid api key|jwt|unauthorized/.test(m))return"認証/APIキー";if(/403|permission|row.level security|rls|not allowed/.test(m))return"権限/RLS";if(/404|does not exist|schema cache|could not find/.test(m))return"テーブル・関数・スキーマ";if(/failed to fetch|network|timeout|fetch/.test(m))return"通信";return"その他"}
$("ops-health-run").addEventListener("click",async()=>{
 const target=$("ops-health-result");target.textContent="読み取り専用の検査中…";
 const checks=[["プロフィール","profiles","id"],["記事","articles","id"],["コメント","comments","id"],["通報","reports","id"],["問い合わせ","inquiries","id"],["サイト設定","site_settings","id"]];
 const results=await Promise.all(checks.map(async([label,table,column])=>{try{const {error}=await db.from(table).select(column,{head:true}).limit(1);if(error)throw error;return{label,ok:true,detail:"読み取り成功"}}catch(e){return{label,ok:false,detail:classifyError(e.message)+"："+e.message}}}));
 const failed=results.filter(x=>!x.ok);
 lastHealth=results.map(x=>(x.ok?"✓ 正常":"✕ 異常")+"　"+x.label+"："+x.detail).join("\n")+"\n\n結果："+(failed.length?failed.length+"項目で失敗。認証・RLS・テーブル名・通信を確認してください。":"検査対象はすべて読み取り可能。サイト全体の完全検査ではありません。");
 target.textContent=lastHealth;
});
$("ops-refresh").addEventListener("click",()=>refreshData().catch(e=>{console.error(e);renderAlerts([{title:"更新に失敗",detail:e.message,level:"エラー"}]);}));
guard().then(async()=>{renderTasks();perf();await refreshData();});
})();