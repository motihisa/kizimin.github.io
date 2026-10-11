(() => {
"use strict";
const $ = id => document.getElementById(id);
const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
const KEY = "sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
const db = window.supabase.createClient(SUPABASE_URL, KEY);
let sessionUser = null, role = "user", lastSnapshot = null, lastStats = {};
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

  // Owner 判定を先に行う。profiles の SELECT が RLS で失敗しても、
  // site_owners に登録されたオーナーをそこで誤拒否しない。
  // 先にオーナーを確認。RPCが失敗した場合は site_owners の本人行を直接照会する。
  let isOwner=false, ownerCheckError=null;
  const {data:ownerFlag,error:ownerError}=await db.rpc("is_site_owner");
  if(!ownerError && ownerFlag===true) isOwner=true;
  else if(ownerError) ownerCheckError=ownerError;
  if(!isOwner) {
   const {data:ownerRow,error:ownerRowError}=await db.from("site_owners").select("user_id").eq("user_id",session.user.id).maybeSingle();
   if(!ownerRowError && ownerRow?.user_id===session.user.id) isOwner=true;
   else if(ownerRowError) ownerCheckError=ownerRowError;
  }

  const {data:p,error:pe}=await db.from("profiles").select("role,account_status").eq("id",session.user.id).maybeSingle();
  if(pe && !isOwner) {
   console.error("運営ツール: profiles 権限確認失敗",pe,"owner check:",ownerCheckError);
   return showDenied("プロフィールの権限確認に失敗しました。詳細はブラウザの開発者ツール Console を確認してください。");
  }
  if(!p && !isOwner) {
   console.error("運営ツール: プロフィールなし、オーナー確認失敗",{profileError:pe,ownerCheckError});
   return showDenied("プロフィールが取得できず、オーナー確認にも失敗しました。Supabaseの権限設定または通信を確認してください。");
  }
  if(p?.account_status && p.account_status!=="active") return showDenied("このアカウントは利用できません。");
  if(!isOwner && !["admin","moderator"].includes(p?.role)) return showDenied("管理者またはオーナーのみ利用できます。");

  role=isOwner?"owner":p.role;
  $("ops-loading").classList.add("hidden"); $("ops-app").classList.remove("hidden"); $("ops-auth-state").textContent=role;
 } catch(e) { console.error(e); showDenied("管理者権限の確認に失敗しました。"); }
}
function renderTasks() {
 const items=readTasks();
 $("ops-task-list").innerHTML=items.length?items.map(t=>'<div class="ops-item"><div><strong>'+esc(t.title)+'</strong><small>優先度：'+esc(t.priority)+' · 担当：'+esc(t.owner||"未指定")+' · 期限：'+esc(t.due||"未指定")+' · '+esc(t.status)+'</small></div><button class="admin-btn" type="button" data-task-toggle="'+esc(t.id)+'">'+(t.status==="完了"?"未完了に戻す":"完了")+'</button><button class="admin-btn danger" type="button" data-task-delete="'+esc(t.id)+'">削除</button></div>').join(""):'<p class="ops-note">タスクはまだありません。</p>';
}
function perf() {
 const n=performance.getEntriesByType("navigation")[0], ms=n?Math.round(n.loadEventEnd||n.duration):0;
 $("ops-page-time").textContent=ms?String(ms):"計測中";
 $("ops-performance").textContent=n?"DOM読込："+Math.round(n.domContentLoadedEventEnd)+" ms\nページ読込："+ms+" ms\n転送サイズ："+(n.transferSize?Math.round(n.transferSize/1024)+" KB":"ブラウザから取得不可"):"計測APIを利用できません。";
}
async function count(table, apply) {
 let q=db.from(table).select("*",{count:"exact",head:true}); if(apply) q=apply(q);
 const {count,error}=await q; if(error) throw new Error(error.message); return count??0;
}
async function read(table, columns, apply) {
 let q=db.from(table).select(columns); if(apply) q=apply(q);
 const {data,error}=await q; if(error) throw new Error(error.message); return data||[];
}
function renderAlerts(items) {
 $("ops-alerts").innerHTML=items.length?items.map(a=>'<div class="ops-item"><div><strong>'+esc(a.title)+'</strong><small>'+esc(a.detail)+'</small></div><span class="admin-badge">'+esc(a.level)+'</span></div>').join(""):'<p class="ops-note">現在、読み取り可能な範囲でアラートはありません。</p>';
}
async function refreshData() {
 perf();
 const alerts=[], errors=[];
 const safe = async (name,fn) => { try { const v=await fn(); lastStats[name]=v; return v; } catch(e) { errors.push(name+"："+e.message); return null; } };
 const [users, articles, visits, reports, inquiries, settings, roles, cats, comments, polls, questions, collections, challenges] = await Promise.all([
  safe("ユーザー数",()=>count("profiles")),
  safe("記事数",()=>count("articles")),
  safe("アクセスログ数",()=>count("access_logs")),
  safe("未解決通報数",()=>count("reports",q=>q.not("status","in",'("resolved","dismissed")'))),
  safe("未対応問い合わせ数",()=>count("inquiries",q=>q.not("status","in",'("resolved","dismissed")'))),
  safe("サイト設定",()=>read("site_settings","id,maintenance_mode,updated_at,updated_by")),
  safe("権限変更履歴",()=>read("role_change_audit","id,target_user_id,changed_by,old_role,new_role,changed_at",q=>q.order("changed_at",{ascending:false}).limit(10))),
  safe("カテゴリ数",()=>count("categories")),
  safe("コメント数",()=>count("comments")),
  safe("投票数",()=>count("community_polls")),
  safe("質問数",()=>count("qa_questions")),
  safe("保存コレクション数",()=>count("saved_collections")),
  safe("チャレンジ数",()=>count("community_challenges"))
 ]);
 const kpis=[
  ["ユーザー",users],["記事",articles],["アクセスログ",visits],["コメント",comments]
 ];
 $("ops-db-kpis") && ($("ops-db-kpis").innerHTML=kpis.map(([n,v])=>'<div class="ops-kpi"><strong>'+esc(v===null?"取得不可":v)+'</strong><span>'+esc(n)+'</span></div>').join(""));
 $("ops-community").textContent = "確認できた既存データ（総数）\n記事："+(articles??"取得不可")+"\nコメント："+(comments??"取得不可")+"\nカテゴリ："+(cats??"取得不可")+"\n投票："+(polls??"取得不可")+"\n質問："+(questions??"取得不可")+"\n保存コレクション："+(collections??"取得不可")+"\nチャレンジ："+(challenges??"取得不可");
 if(reports>0) alerts.push({title:"未解決の通報",detail:"対応が必要な通報が "+reports+" 件あります。管理画面の通報欄を確認してください。",level:"要確認"});
 if(inquiries>0) alerts.push({title:"未対応の問い合わせ",detail:"未対応の問い合わせが "+inquiries+" 件あります。",level:"要確認"});
 if(Array.isArray(settings)&&settings.length) {
  const s=settings[0]; $("ops-maintenance-state").textContent=s.maintenance_mode?"有効":"無効";
  const snap={maintenance_mode:s.maintenance_mode,updated_at:s.updated_at,updated_by:s.updated_by};
  const previous=localStorage.getItem("kizimin_ops_settings_snapshot");
  if(previous) { try { const old=JSON.parse(previous); if(old.maintenance_mode!==snap.maintenance_mode) alerts.push({title:"メンテナンス設定の差分",detail:"前回このブラウザで保存した観測値から状態が変わっています。更新日時："+date(s.updated_at),level:"差分"}); } catch {} }
  lastSnapshot=snap;
  $("ops-settings-snapshot").textContent="現在値（読み取り専用）\nメンテナンス："+(s.maintenance_mode?"有効":"無効")+"\n最終更新："+date(s.updated_at)+"\n更新者ID："+(s.updated_by||"不明");
 }
 if(Array.isArray(roles)&&roles.length) $("ops-role-history").textContent=roles.map(r=>date(r.changed_at)+" · "+(r.old_role||"?")+" → "+(r.new_role||"?")+" · 対象ID "+r.target_user_id+" · 実行者 "+r.changed_by).join("\n");
 else $("ops-role-history").textContent=roles===null?"権限変更履歴を読み込めませんでした。":"権限変更履歴はありません。";
 if(errors.length) alerts.push({title:"一部データにアクセスできません",detail:errors.join(" / "),level:"注意"});
 if(!settings) $("ops-settings-snapshot").textContent="サイト設定の取得に失敗しました。RLSまたは通信を確認してください。";
 if(users===null||articles===null||visits===null) alerts.push({title:"運営統計が一部未取得",detail:"権限（RLS）または通信エラーのため、取得できた項目だけを表示しています。",level:"注意"});
 renderAlerts(alerts);
 $("ops-integrity-result").textContent="直近の読み取り結果\n"+Object.entries(lastStats).map(([k,v])=>k+"："+(v===null?"取得不可":v)).join("\n")+"\n\nこの検査は読み取り専用です。RLSで見えないデータを完全検査したとは限りません。";
}
$("ops-task-form").addEventListener("submit",e=>{e.preventDefault();const title=$("ops-task-title").value.trim();if(!title)return;const a=readTasks();a.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),title,priority:$("ops-task-priority").value,owner:$("ops-task-owner").value.trim(),due:$("ops-task-due").value,status:"未完了",createdAt:new Date().toISOString()});if(!writeTasks(a))return alert("このブラウザに保存できませんでした。");e.target.reset();renderTasks();});
$("ops-task-list").addEventListener("click",e=>{const t=e.target.closest("[data-task-toggle]"),d=e.target.closest("[data-task-delete]");let a=readTasks();if(t)a=a.map(x=>x.id===t.dataset.taskToggle?{...x,status:x.status==="完了"?"未完了":"完了"}:x);else if(d){if(!confirm("このブラウザ内のタスクを削除しますか？"))return;a=a.filter(x=>x.id!==d.dataset.taskDelete)}else return;if(!writeTasks(a))alert("保存に失敗しました。");renderTasks();});
$("ops-export-tasks").addEventListener("click",()=>{const rows=[["内容","優先度","担当","期限","状態","作成日時"],...readTasks().map(t=>[t.title,t.priority,t.owner,t.due,t.status,t.createdAt])];download("kizimin-admin-tasks.csv","\ufeff"+rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n"),"text/csv;charset=utf-8");});
$("ops-integrity-run").addEventListener("click",async()=>{ $("ops-integrity-result").textContent="読み取り専用チェックを実行中…"; await refreshData();});
$("ops-report-export").addEventListener("click",()=>{
 const report={title:"Kizimin 運営レポート",generatedAt:new Date().toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}),role,statistics:lastStats,settings:lastSnapshot,roleChangeHistory:$("ops-role-history").innerText,alerts:$("ops-alerts").innerText,performance:performance.getEntriesByType("navigation").map(n=>({domContentLoadedMs:Math.round(n.domContentLoadedEventEnd),loadMs:Math.round(n.loadEventEnd||n.duration),transferSize:n.transferSize||null})),localTasks:readTasks(),limitations:["RLSで参照できないデータは含まれません","このツールからデータベース変更は行っていません","タスクはこのブラウザ内に保存されています"]};
 const safe=v=>esc(typeof v==="string"?v:JSON.stringify(v,null,2)??"未取得");
 const section=(title,value)=>'<section><h2>'+esc(title)+'</h2><pre>'+safe(value??"未取得")+'</pre></section>';
 const rows=Object.entries(report.statistics||{}).map(([k,v])=>'<tr><th>'+esc(k)+'</th><td>'+safe(v)+'</td></tr>').join("");
 const taskRows=report.localTasks.map(t=>'<tr><td>'+esc(t.title)+'</td><td>'+esc(t.priority)+'</td><td>'+esc(t.owner||"未指定")+'</td><td>'+esc(t.due||"未指定")+'</td><td>'+esc(t.status)+'</td></tr>').join("");
 const html='<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Kizimin 運営レポート</title><style>body{font-family:Arial,"Noto Sans JP",sans-serif;color:#172033;margin:28px;line-height:1.5}h1{font-size:24px;border-bottom:3px solid #334155;padding-bottom:10px}h2{font-size:16px;margin-top:24px;background:#eef2f7;padding:8px}p{color:#475569}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;overflow-wrap:anywhere}th{background:#f8fafc}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 monospace;background:#f8fafc;border:1px solid #e2e8f0;padding:10px}button{padding:10px 16px;margin-bottom:16px}@media print{body{margin:12mm}button{display:none}h2,th{print-color-adjust:exact;-webkit-print-color-adjust:exact}section,table{break-inside:avoid}}</style></head><body><button onclick="window.print()">PDFとして保存 / 印刷</button><h1>Kizimin 運営レポート</h1><p><b>生成日時：</b>'+esc(report.generatedAt)+'　 <b>権限：</b>'+esc(report.role)+'</p><h2>統計情報</h2><table><thead><tr><th>項目</th><th>値</th></tr></thead><tbody>'+rows+'</tbody></table>'+section("アラート",report.alerts)+section("設定スナップショット",report.settings)+section("権限変更履歴",report.roleChangeHistory)+section("パフォーマンス",report.performance)+'<section><h2>ローカルタスク</h2><table><thead><tr><th>タスク</th><th>優先度</th><th>担当</th><th>期限</th><th>状態</th></tr></thead><tbody>'+taskRows+'</tbody></table></section>'+section("注意事項",report.limitations.map(x=>"・"+x).join("\n"))+'</body></html>';
 const w=window.open("","_blank");
 if(!w){$("ops-report-status").textContent="ポップアップがブロックされました。ブラウザでこのサイトのポップアップを許可してください。";return;}
 w.document.open();w.document.write(html);w.document.close();
 $("ops-report-status").textContent="レポートを開きました。印刷画面で「PDFに保存」を選んでください。";
});
$("ops-safety-check").addEventListener("click",()=>{$("ops-safety-result").textContent=["□ 変更対象と既存機能への影響範囲を確認","□ 変更前の値・復元手順を記録","□ 本番DBではなくテスト環境で検証","□ RLSとサーバー側権限を確認","□ 差分をレビューし、明示承認を得る","□ 適用後に関連機能を回帰テスト"].join("\n");});
$("ops-save-snapshot").addEventListener("click",()=>{if(!lastSnapshot)return alert("保存できる設定値がありません。先に更新してください。");localStorage.setItem("kizimin_ops_settings_snapshot",JSON.stringify(lastSnapshot));$("ops-snapshot-status").textContent="現在の読み取り値をこのブラウザに保存しました。これはDB復元用バックアップではありません。";});
$("ops-refresh").addEventListener("click",()=>refreshData().catch(e=>{console.error(e);renderAlerts([{title:"更新に失敗",detail:e.message,level:"エラー"}]);}));

const incidentKey="kizimin_ops_incidents_v1";
function getIncidents(){try{const x=JSON.parse(localStorage.getItem(incidentKey)||"[]");return Array.isArray(x)?x:[]}catch{return[]}}
function saveIncident(title,detail,level="注意"){const a=getIncidents();a.unshift({at:new Date().toISOString(),title,detail,level});try{localStorage.setItem(incidentKey,JSON.stringify(a.slice(0,100)))}catch{}renderIncidents()}
function renderIncidents(){const a=getIncidents();$("ops-incidents-result").textContent=a.length?a.slice(0,20).map(x=>date(x.at)+" · "+x.level+" · "+x.title+"\n"+x.detail).join("\n\n"):"ローカル記録はありません。"}
function classifyError(message){const m=String(message||"").toLowerCase();if(/401|invalid api key|jwt|unauthorized/.test(m))return"認証/APIキー";if(/403|permission|row.level security|rls|not allowed/.test(m))return"権限/RLS";if(/404|does not exist|schema cache|could not find/.test(m))return"テーブル・関数・スキーマ";if(/failed to fetch|network|timeout|fetch/.test(m))return"通信";return"その他"}
$("ops-health-run").addEventListener("click",async()=>{
 const target=$("ops-health-result");target.textContent="読み取り専用の検査中…";
 const checks=[["プロフィール","profiles","id"],["記事","articles","id"],["コメント","comments","id"],["通報","reports","id"],["問い合わせ","inquiries","id"],["サイト設定","site_settings","id"]];
 const results=await Promise.all(checks.map(async([label,table,column])=>{try{const {error}=await db.from(table).select(column,{head:true}).limit(1);if(error)throw error;return{label,ok:true,detail:"読み取り成功"}}catch(e){return{label,ok:false,detail:classifyError(e.message)+"： "+e.message}}}));
 const failed=results.filter(x=>!x.ok);
 target.textContent=results.map(x=>(x.ok?"✓ 正常":"✕ 異常")+"　"+x.label+"： "+x.detail).join("\n")+
 "\n\n結果："+(failed.length?failed.length+"項目で失敗。APIキー・認証・RLS・テーブル名・通信を分類して確認してください。":"検査対象はすべて読み取り可能。これはサイト全体の完全検査ではありません。");
 failed.forEach(x=>saveIncident("健康診断: "+x.label,x.detail,"エラー"));
 if(!failed.length)saveIncident("健康診断","検査対象6項目の読み取り成功","正常");
});
$("ops-incidents-export").addEventListener("click",()=>{const a=getIncidents();const rows=[["日時","項目","詳細","レベル"],...a.map(x=>[x.at,x.title,x.detail,x.level])];download("kizimin-incidents.csv","\ufeff"+rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n"),"text/csv;charset=utf-8")});
$("ops-incidents-clear").addEventListener("click",()=>{if(!confirm("このブラウザ内に保存された診断記録だけを消去します。続行しますか？"))return;localStorage.removeItem(incidentKey);renderIncidents()});
$("ops-backup-check").addEventListener("click",()=>{$("ops-backup-result").textContent=[
"状態：このページからSupabaseのバックアップ状態を直接確認できません。",
"確認先：Supabase Dashboard → Database / Backups（プラン・プロジェクト設定により表示が異なります）。",
"実行前：バックアップ日時・保持期間・復元対象・復元先を確認してください。",
"安全策：本番へ直接復元せず、可能なら別プロジェクトで復元検証してください。",
"注意：現在の機能は準備チェックのみ。バックアップ作成・復元は実行していません。"
].join("\n")});
$("ops-queue-refresh").addEventListener("click",async()=>{const out=$("ops-queue-result");out.textContent="読み取り中…";const results=await Promise.all([["未解決通報",()=>count("reports",q=>q.not("status","in",'("resolved","dismissed")'))],["未対応問い合わせ",()=>count("inquiries",q=>q.not("status","in",'("resolved","dismissed")'))]].map(async([name,fn])=>{try{return name+"："+await fn()+" 件"}catch(e){return name+"：取得失敗（"+classifyError(e.message)+"）"}}));out.textContent=results.join("\n")+"\n本文や個人情報は取得していません。"});
$("ops-analytics-save").addEventListener("click",()=>{const current={at:new Date().toISOString(),stats:lastStats};let previous=null;try{previous=JSON.parse(localStorage.getItem("kizimin_ops_analytics_snapshot")||"null")}catch{}const lines=["現在の集計日時："+date(current.at)];for(const [k,v] of Object.entries(current.stats)){const old=previous?.stats?.[k];lines.push(k+"："+(v===null?"取得不可":v)+(old!==undefined&&old!==null&&v!==null?"（前回比 "+(typeof v==="number"&&typeof old==="number"?(v-old>=0?"+":"")+(v-old):"比較不可")+"）":"（比較用の前回値なし）"))}try{localStorage.setItem("kizimin_ops_analytics_snapshot",JSON.stringify(current));$("ops-analytics-result").textContent=lines.join("\n")+"\nこの比較はこのブラウザに保存された2回分のみです。"}catch{$("ops-analytics-result").textContent="ブラウザ内に保存できませんでした。"}});
async function loadOpsRows(table,target,mapper){const el=$(target);el.textContent="読み込み中…";try{const {data,error}=await db.from(table).select("*").order("created_at",{ascending:false}).limit(50);if(error)throw error;el.textContent=data?.length?data.map(mapper).join("\n\n"):"記録はありません。";}catch(e){el.textContent="読み込み失敗："+classifyError(e.message)+"："+e.message;}}
$("ops-server-incidents-refresh").addEventListener("click",()=>loadOpsRows("kizimin_ops_incidents","ops-server-incidents-result",x=>date(x.created_at)+" · "+x.severity+" · "+x.title+"\n"+(x.detail||"")));
$("ops-approvals-refresh").addEventListener("click",()=>loadOpsRows("kizimin_ops_approvals","ops-approvals-result",x=>"#"+x.id+" · "+x.status+" · "+x.action_type+"\n"+x.title+"\n"+date(x.created_at)));
$("ops-schedules-refresh").addEventListener("click",()=>loadOpsRows("kizimin_ops_schedules","ops-schedules-result",x=>"#"+x.id+" · "+(x.enabled?"有効":"停止中")+" · "+x.name+"\n"+x.task_type+" / "+x.schedule_cron+"\n自動実行にはスケジューラー接続が必要です。"));
$("ops-approval-form").addEventListener("submit",async e=>{e.preventDefault();const out=$("ops-approvals-result");out.textContent="保存中…";const {data:{user}}=await db.auth.getUser();const row={requested_by:user.id,action_type:$("ops-approval-type").value,title:$("ops-approval-title").value.trim(),details:{summary:$("ops-approval-detail").value.trim()}};const {error}=await db.from("kizimin_ops_approvals").insert(row);if(error){out.textContent="保存失敗："+classifyError(error.message)+"："+error.message;return;}e.target.reset();out.textContent="承認依頼を保存しました。実際の変更・復元は未実行です。";});
$("ops-schedule-form").addEventListener("submit",async e=>{e.preventDefault();const out=$("ops-schedules-result");out.textContent="保存中…";const {data:{user}}=await db.auth.getUser();const row={name:$("ops-schedule-name").value.trim(),task_type:$("ops-schedule-type").value,schedule_cron:$("ops-schedule-cron").value,enabled:false,created_by:user.id};const {error}=await db.from("kizimin_ops_schedules").insert(row);if(error){out.textContent="保存失敗："+classifyError(error.message)+"："+error.message;return;}e.target.reset();out.textContent="設定案を無効状態で保存しました。自動実行はまだ有効ではありません。";});
guard().then(async()=>{renderTasks();perf();renderIncidents();await refreshData();$("ops-scheduler-status").textContent="実行中のEdge Functionsはデプロイ済み関数として別途管理されています。このブラウザから定期実行の作成・変更は行いません。";});
})();