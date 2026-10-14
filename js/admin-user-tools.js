(() => {
"use strict";
const $=id=>document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => { switch (character) { case "&": return "&amp;"; case "<": return "&lt;"; case ">": return "&gt;"; case '"': return "&quot;"; case "'": return "&#039;"; default: return character; } });
const labels={user:"一般ユーザー",moderator:"モデレーター",admin:"管理者",owner:"オーナー",active:"有効",banned:"BAN",suspended:"一時停止"};
const fmt=v=>v?new Date(v).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"なし";
const reasons=["利用規約に反する投稿が確認されたため","他のユーザーへの迷惑行為が確認されたため","通報内容を確認し、運営による対応が必要と判断したため","確認のため一時的に利用を制限しています"];
let ready=false,rows=[],q="",status="all",role="all";
function setup(){
 const view=$("view-users"); if(!view||ready)return;
 const panel=view.querySelector(".admin-panel"),wrap=panel?.querySelector(".admin-table-wrap");if(!panel||!wrap)return;ready=true;
 let c=$("user-tools-controls");
 if(!c){c=document.createElement("div");c.id="user-tools-controls";c.innerHTML='<div class="user-tools-stats" id="user-tools-stats"></div><div class="user-tools-filters"><label>状態<select id="user-status-filter"><option value="all">すべて</option><option value="active">有効</option><option value="banned">BAN</option><option value="suspended">一時停止</option></select></label><label>権限<select id="user-role-filter"><option value="all">すべて</option><option value="user">一般ユーザー</option><option value="moderator">モデレーター</option><option value="admin">管理者</option></select></label><label>BAN解除予定<select id="user-expiry-filter"><option value="all">すべて</option><option value="soon">7日以内</option><option value="expired">期限超過</option><option value="indefinite">無期限</option></select></label><button class="admin-btn" id="user-filter-reset" type="button">絞り込み解除</button></div><div id="user-expiry-summary" class="user-expiry-summary"></div>';panel.insertBefore(c,wrap);}
 let d=$("user-detail-dialog");if(!d){d=document.createElement("dialog");d.id="user-detail-dialog";d.className="user-detail-dialog";d.innerHTML='<div class="user-detail-head"><div><h2 id="user-detail-title">ユーザー詳細</h2><p id="user-detail-subtitle" class="admin-muted"></p></div><button id="user-detail-close" type="button" class="admin-btn">閉じる</button></div><div id="user-detail-content"></div>';document.body.appendChild(d);}
 $("user-status-filter").onchange=e=>{status=e.target.value;filterRows()};
 $("user-role-filter").onchange=e=>{role=e.target.value;filterRows()};
 $("user-expiry-filter").onchange=filterRows;
 $("user-filter-reset").onclick=()=>{status="all";role="all";q="";$("user-status-filter").value="all";$("user-role-filter").value="all";$("user-expiry-filter").value="all";if($("user-search"))$("user-search").value="";filterRows()};
 $("user-detail-close").onclick=()=>d.close();d.addEventListener("click",e=>{if(e.target===d)d.close()});
 if($("user-search"))$("user-search").addEventListener("input",e=>{q=e.target.value.trim().toLowerCase();filterRows()});
 new MutationObserver(decorate).observe($("users-body")||view,{childList:true,subtree:true});decorate();
}
function read(r){
 const cells=Array.from(r.cells||r.children||[]);
 const cellText=index=>cells[index]?.textContent?.trim()||"";
 const s=r.querySelector(".account-status"),ro=r.querySelector(".user-role-select"),ex=r.querySelector(".ban-expires");
 return {row:r,id:s?.dataset.id||ro?.dataset.id||ex?.dataset.id,status:s?.value||(cellText(3).includes("BAN")?"banned":"active"),role:ro?.value||(cellText(2).includes("オーナー")?"owner":cellText(2).includes("管理者")?"admin":cellText(2).includes("モデレーター")?"moderator":"user"),expiry:ex?.value||"",name:cellText(1)||cellText(0)||"ユーザー",username:cellText(0),registered:cellText(4)||"-",reason:cells[3]?.querySelector(".admin-muted")?.textContent||""};
}
function decorate(){
 const b=$("users-body");if(!b)return;rows=[...b.querySelectorAll("tr")].filter(r=>r.querySelector(".account-status")||r.querySelector(".user-role-select")).map(read);
 rows.forEach(x=>{const a=x.row.querySelector(".admin-actions");if(!a)return;
 if(!a.querySelector(".user-detail-open")){const btn=document.createElement("button");btn.type="button";btn.className="admin-btn user-detail-open";btn.textContent="詳細";btn.onclick=()=>details(x.id);a.appendChild(btn)}
 if(!a.querySelector(".user-warning-open")&&!x.row.querySelector(".account-status")?.disabled&&["admin","moderator","owner"].includes(window.__kiziminCurrentUserRole)){const btn=document.createElement("button");btn.type="button";btn.className="admin-btn user-warning-open";btn.textContent="警告";btn.onclick=()=>warn(x.id);a.appendChild(btn)}
 });
 const total=rows.length,ban=rows.filter(x=>x.status==="banned").length,sus=rows.filter(x=>x.status==="suspended").length,admins=rows.filter(x=>["admin","owner"].includes(x.role)).length,soon=rows.filter(x=>x.status==="banned"&&x.expiry&&new Date(x.expiry)>new Date()&&new Date(x.expiry)<new Date(Date.now()+604800000)).length;
 if($("user-tools-stats"))$("user-tools-stats").innerHTML=[["登録ユーザー",total],["BAN中",ban],["一時停止",sus],["管理者・オーナー",admins],["7日以内に解除",soon]].map(a=>'<div class="user-stat-card"><span>'+esc(a[0])+'</span><strong>'+a[1]+'</strong></div>').join("");
 const expired=rows.filter(x=>x.status==="banned"&&x.expiry&&new Date(x.expiry)<=new Date()).length,indef=rows.filter(x=>x.status==="banned"&&!x.expiry).length;
 if($("user-expiry-summary"))$("user-expiry-summary").innerHTML="<strong>BAN解除予定：</strong> 7日以内 "+soon+"件 / 期限超過 "+expired+"件 / 無期限 "+indef+"件";
 filterRows();
}
function filterRows(){
 const mode=$("user-expiry-filter")?.value||"all",now=Date.now(),week=now+604800000;
 rows.forEach(x=>{const t=x.expiry?new Date(x.expiry).getTime():null,expiryOk=mode==="all"||(mode==="soon"&&x.status==="banned"&&t!==null&&t>now&&t<=week)||(mode==="expired"&&x.status==="banned"&&t!==null&&t<=now)||(mode==="indefinite"&&x.status==="banned"&&!x.expiry);x.row.hidden=!(x.row.textContent.toLowerCase().includes(q)&&(status==="all"||x.status===status)&&(role==="all"||x.role===role)&&expiryOk)});
}
async function details(id){
 const x=rows.find(a=>a.id===id);if(!x)return;
 $("user-detail-title").textContent=x.name;$("user-detail-subtitle").textContent="ユーザーID: "+id;
 $("user-detail-content").innerHTML='<div class="user-detail-grid"><div><span>表示名</span><strong>'+esc(x.name)+'</strong></div><div><span>ユーザー名</span><strong>'+esc(x.username)+'</strong></div><div><span>権限</span><strong>'+esc(labels[x.role]||x.role)+'</strong></div><div><span>状態</span><strong>'+esc(labels[x.status]||x.status)+'</strong></div><div><span>登録日</span><strong>'+esc(x.registered)+'</strong></div><div><span>BAN解除日時（JST）</span><strong>'+esc(x.expiry?fmt(x.expiry):(x.status==="banned"?"無期限":"-"))+'</strong></div><div class="user-detail-wide"><span>制限理由</span><p>'+esc(x.reason||"記録なし")+'</p></div></div><h3>関連通報・運営通知</h3><div id="user-activity-loading" class="admin-muted">履歴を読み込んでいます...</div>';
 $("user-detail-dialog").showModal();
 try{
 const client=window.supabase.createClient("https://bimddapbkdakspjaemsm.supabase.co","sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf");
 const r=await client.functions.invoke("secure-content",{body:{action:"admin_user_activity",user_id:id}});
 if(r.error||!r.data?.ok)throw r.error||new Error(r.data?.error||"取得失敗");
 const el=$("user-activity-loading");if(el){const items=(r.data.items||[]);el.outerHTML='<div class="user-activity-list">'+(items.length?items.map(v=>'<div class="user-activity-item"><strong>'+esc(v.title||v.kind||"履歴")+'</strong><p>'+esc(v.body||v.reason||v.status||"")+'</p><small>'+esc(fmt(v.created_at))+'</small></div>').join(""):'<p class="admin-muted">表示できる履歴はありません。</p>')+'</div>';}
 }catch(e){const el=$("user-activity-loading");if(el)el.innerHTML='<div class="admin-alert">履歴を読み込めませんでした。secure-content関数の更新・デプロイ状態と権限を確認してください。</div>';console.warn("ユーザー履歴取得失敗",e)}
}
async function warn(id){
 const x=rows.find(a=>a.id===id);if(!x)return;
 const choice=prompt("警告理由のテンプレート番号を入力してください。\n1. "+reasons[0]+"\n2. "+reasons[1]+"\n3. "+reasons[2]+"\n4. "+reasons[3]+"\n0. 自由記述");
 if(choice===null)return;let reason="";
 if(choice.trim()==="0")reason=prompt("警告理由を入力してください。")||"";else if(/^[1-4]$/.test(choice.trim()))reason=reasons[Number(choice.trim())-1];else{alert("0〜4を入力してください。");return}
 if(!reason.trim()){alert("理由が空のため中止しました。");return}
 const note=prompt("ユーザーに伝える補足（任意）");if(note===null)return;
 const body="運営からの警告です。\n理由: "+reason.trim()+(note.trim()?"\n補足: "+note.trim():"");
 if(!confirm("サイト内通知で警告を送信しますか？\n\n対象: "+x.name+"\n"+body))return;
 try{const client=window.supabase.createClient("https://bimddapbkdakspjaemsm.supabase.co","sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf");const r=await client.functions.invoke("secure-content",{body:{action:"admin_user_warning",user_id:id,reason:reason.trim(),note:note.trim()}});if(r.error||!r.data?.ok)throw r.error||new Error(r.data?.error||"送信失敗");alert("警告通知を送信しました。")}
 catch(e){console.error("警告通知失敗",e);alert("警告通知を送信できませんでした。secure-content関数の更新・デプロイ状態と権限を確認してください。")}
}
window.KiziminUserTools={refresh:decorate,details,warn};
const obs=new MutationObserver(setup);obs.observe(document.documentElement,{childList:true,subtree:true});document.addEventListener("DOMContentLoaded",setup);setTimeout(setup,0);
})();