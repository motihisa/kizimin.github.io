(() => {
"use strict";
const $=id=>document.getElementById(id);
const SUPABASE_URL="https://bimddapbkdakspjaemsm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXJuIiwicmVmIjoiYmltZGRhcGJrZGRha3NwamFlbXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMTU0MTksImV4cCI6MjEwNjg5MTQxOX0.qezG4VOkyYfaa4DxClk1PSV7bZEne7WEbxj52m1l7iM";
const supabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
let sessionUser=null,role="user";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeReadTasks=()=>{try{const v=JSON.parse(localStorage.getItem("kizimin_admin_ops_tasks_v1")||"[]");return Array.isArray(v)?v:[]}catch{return []}};
const safeWriteTasks=items=>{try{localStorage.setItem("kizimin_admin_ops_tasks_v1",JSON.stringify(items));return true}catch{return false}};
function showDenied(msg){$("ops-loading").classList.add("hidden");$("ops-denied").classList.remove("hidden");$("ops-denied-reason").textContent=msg}
async function guard(){
try{
const {data:{session},error}=await supabase.auth.getSession();
if(error||!session?.user?.id){showDenied("ログインセッションを確認できません。管理画面からログインしてください。");return}
sessionUser=session.user;
const {data:profile,error:pe}=await supabase.from("profiles").select("role,account_status").eq("id",session.user.id).maybeSingle();
if(pe||!profile){showDenied("プロフィールの権限確認に失敗しました。");return}
const {data:owner,error:oe}=await supabase.rpc("is_site_owner");
if(profile.account_status&&profile.account_status!=="active"){showDenied("このアカウントは利用できません。");return}
if(!["admin","moderator"].includes(profile.role)&&!(owner===true&&!oe)){showDenied("管理者またはオーナーのみ利用できます。");return}
role=owner===true&&!oe?"owner":profile.role;
$("ops-loading").classList.add("hidden");$("ops-app").classList.remove("hidden");
$("ops-auth-state").textContent=role==="owner"?"Owner":role;
}catch(e){console.error(e);showDenied("管理者権限の確認に失敗しました。")}
}
function renderTasks(){
const items=safeReadTasks();
$("ops-task-list").innerHTML=items.length?items.map(t=>'<div class="ops-item"><div><strong>'+esc(t.title)+'</strong><small>優先度：'+esc(t.priority)+' · 担当：'+esc(t.owner||"未指定")+' · 期限：'+esc(t.due||"未指定")+' · '+esc(t.status)+'</small></div><button class="admin-btn" type="button" data-task-toggle="'+esc(t.id)+'">'+(t.status==="完了"?"未完了に戻す":"完了")+'</button><button class="admin-btn danger" type="button" data-task-delete="'+esc(t.id)+'">削除</button></div>').join(""):'<p class="ops-note">タスクはまだありません。</p>';
}
function download(name,text,type="text/plain;charset=utf-8"){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function performanceText(){
const nav=performance.getEntriesByType("navigation")[0];const ms=nav?Math.round(nav.loadEventEnd||nav.duration):0;
$("ops-page-time").textContent=ms?String(ms):"計測中";
$("ops-performance").textContent=nav?"DOM読込："+Math.round(nav.domContentLoadedEventEnd)+" ms\nページ読込："+ms+" ms\n転送サイズ："+(nav.transferSize?Math.round(nav.transferSize/1024)+" KB":"ブラウザから取得不可"):"このブラウザではNavigation Timingが利用できません。";
}
$("ops-task-form").addEventListener("submit",e=>{e.preventDefault();const title=$("ops-task-title").value.trim();if(!title)return;const items=safeReadTasks();items.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),title,priority:$("ops-task-priority").value,owner:$("ops-task-owner").value.trim(),due:$("ops-task-due").value,status:"未完了",createdAt:new Date().toISOString()});if(!safeWriteTasks(items)){alert("ブラウザ内に保存できませんでした。");return}e.target.reset();renderTasks()});
$("ops-task-list").addEventListener("click",e=>{const toggle=e.target.closest("[data-task-toggle]"),del=e.target.closest("[data-task-delete]");let items=safeReadTasks();if(toggle){items=items.map(t=>t.id===toggle.dataset.taskToggle?{...t,status:t.status==="完了"?"未完了":"完了"}:t)}else if(del){if(!confirm("このローカルタスクを削除しますか？"))return;items=items.filter(t=>t.id!==del.dataset.taskDelete)}else return;if(!safeWriteTasks(items)){alert("保存に失敗しました。");return}renderTasks()});
$("ops-export-tasks").addEventListener("click",()=>{const rows=[["内容","優先度","担当","期限","状態","作成日時"],...safeReadTasks().map(t=>[t.title,t.priority,t.owner,t.due,t.status,t.createdAt])];download("kizimin-admin-tasks.csv","\ufeff"+rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n"),"text/csv;charset=utf-8")});
$("ops-integrity-run").addEventListener("click",()=>{const checks=[["管理者セッション",!!sessionUser],["現在のページURL",location.protocol==="https:"||location.hostname==="localhost"],["タスク保存領域",(()=>{try{const k="kizimin_ops_integrity_test";localStorage.setItem(k,"ok");const ok=localStorage.getItem(k)==="ok";localStorage.removeItem(k);return ok}catch{return false}})()],["ブラウザ計測API",typeof performance.getEntriesByType==="function"]];$("ops-integrity-result").textContent=checks.map(([n,ok])=>(ok?"✓ ":"⚠ ")+n+"："+(ok?"OK":"確認が必要")).join("\n")+"\n\nこれはブラウザ内の基本検査です。Supabaseのレコード整合性を検査した結果ではありません。"});
$("ops-report-export").addEventListener("click",()=>{const report={title:"Kizimin 運営ツールレポート",generatedAt:new Date().toISOString(),role,sessionUserId:sessionUser?.id||null,pagePerformance:performance.getEntriesByType("navigation").map(n=>({domContentLoadedMs:Math.round(n.domContentLoadedEventEnd),loadMs:Math.round(n.loadEventEnd||n.duration),transferSize:n.transferSize||null})),localTasks:safeReadTasks(),limitations:["DB統計は未接続","Supabaseのレコードや設定を変更していない","個人情報を集計・出力していない"]};download("kizimin-ops-report.json",JSON.stringify(report,null,2),"application/json");$("ops-report-status").textContent="レポートを生成しました。DB統計は含まれていません。"});
$("ops-safety-check").addEventListener("click",()=>{$("ops-safety-result").textContent=["□ 変更対象と既存機能への影響範囲を確認する","□ 本番DBの変更・削除が必要かを明記する","□ 変更前のバックアップまたは復元方法を確認する","□ テスト環境で検証する","□ 変更内容を提示し、承認を得る","□ 適用後に関連機能を回帰テストする"].join("\n")});
$("ops-refresh").addEventListener("click",()=>{performanceText();$("ops-alerts").innerHTML='<div class="ops-item"><div><strong>DB統計の連携</strong><small>実在テーブルとRLSを確認後に接続してください。</small></div><span class="admin-badge">未接続</span></div><div class="ops-item"><div><strong>定期処理の状態</strong><small>実行基盤が未指定です。</small></div><span class="admin-badge">未接続</span></div>';});
guard().then(()=>{renderTasks();performanceText();$("ops-refresh").click()});
})();