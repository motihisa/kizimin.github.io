(() => {
"use strict";
const $ = id => document.getElementById(id);
const SUPABASE_URL = "https://bimddapbkdakspjaemsm.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImJpbWRkYXBia2Rha3NwamFlbXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMTU0MTksImV4cCI6MjEwNjg5MTQxOX0.qezG4VOkyYfaa4DxClk1PSV7bZEne7WEbxj52m1l7iM";
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
  const {data:{session},error}=await db.auth.getSession();
  if(error||!session?.user?.id) return showDenied("ログインセッションを確認できません。管理画面からログインしてください。");
  sessionUser=session.user;
  const {data:p,error:pe}=await db.from("profiles").select("role,account_status").eq("id",session.user.id).maybeSingle();
  if(pe||!p) return showDenied("プロフィールの権限確認に失敗しました。");
  const {data:o,error:oe}=await db.rpc("is_site_owner");
  if(p.account_status && p.account_status!=="active") return showDenied("このアカウントは利用できません。");
  if(!["admin","moderator"].includes(p.role) && !(o===true&&!oe)) return showDenied("管理者またはオーナーのみ利用できます。");
  role=o===true&&!oe?"owner":p.role;
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
  safe("コメント数",()=>count("comments"))
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
$("ops-report-export").addEventListener("click",()=>{const report={title:"Kizimin 運営レポート",generatedAt:new Date().toISOString(),role,statistics:lastStats,settings:lastSnapshot,roleChangeHistory:$("ops-role-history").textContent,alerts:$("ops-alerts").innerText,performance:performance.getEntriesByType("navigation").map(n=>({domContentLoadedMs:Math.round(n.domContentLoadedEventEnd),loadMs:Math.round(n.loadEventEnd||n.duration),transferSize:n.transferSize||null})),localTasks:readTasks(),limitations:["RLSで参照できないデータは含まれない","このツールからDB変更は行っていない","タスクはこのブラウザ内に保存"]};download("kizimin-ops-report.json",JSON.stringify(report,null,2),"application/json");$("ops-report-status").textContent="レポートを生成しました。取得できなかった項目はレポート内で確認してください。";});
$("ops-safety-check").addEventListener("click",()=>{$("ops-safety-result").textContent=["□ 変更対象と既存機能への影響範囲を確認","□ 変更前の値・復元手順を記録","□ 本番DBではなくテスト環境で検証","□ RLSとサーバー側権限を確認","□ 差分をレビューし、明示承認を得る","□ 適用後に関連機能を回帰テスト"].join("\n");});
$("ops-save-snapshot").addEventListener("click",()=>{if(!lastSnapshot)return alert("保存できる設定値がありません。先に更新してください。");localStorage.setItem("kizimin_ops_settings_snapshot",JSON.stringify(lastSnapshot));$("ops-snapshot-status").textContent="現在の読み取り値をこのブラウザに保存しました。これはDB復元用バックアップではありません。";});
$("ops-refresh").addEventListener("click",()=>refreshData().catch(e=>{console.error(e);renderAlerts([{title:"更新に失敗",detail:e.message,level:"エラー"}]);}));
guard().then(async()=>{renderTasks();perf();await refreshData();$("ops-scheduler-status").textContent="実行中のEdge Functionsはデプロイ済み関数として別途管理されています。このブラウザから定期実行の作成・変更は行いません。";});
})();