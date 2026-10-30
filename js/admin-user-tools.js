(() => {
"use strict";
const $=id=>document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => { switch (character) { case "&": return "&amp;"; case "<": return "&lt;"; case ">": return "&gt;"; case '"': return "&quot;"; case "'": return "&#039;"; default: return character; } });
const labels={user:"一般ユーザー",moderator:"モデレーター",admin:"管理者",debugger:"デバッカー",owner:"オーナー",active:"有効",banned:"BAN",suspended:"一時停止"};
const fmt=v=>v?new Date(v).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"なし";
const reasons=["利用規約に反する投稿が確認されたため","他のユーザーへの迷惑行為が確認されたため","通報内容を確認し、運営による対応が必要と判断したため","確認のため一時的に利用を制限しています"];
let ready=false,rows=[],q="",status="all",role="all";
function setup(){
 const view=$("view-users"); if(!view||ready)return;
 const panel=view.querySelector(".admin-panel"),wrap=panel?.querySelector(".admin-table-wrap");if(!panel||!wrap)return;ready=true;
 let c=$("user-tools-controls");
 if(!c){c=document.createElement("div");c.id="user-tools-controls";c.innerHTML='<div class="user-tools-stats" id="user-tools-stats"></div><div class="user-tools-filters"><label>状態<select id="user-status-filter"><option value="all">すべて</option><option value="active">有効</option><option value="banned">BAN</option><option value="suspended">一時停止</option></select></label><label>権限<select id="user-role-filter"><option value="all">すべて</option><option value="user">一般ユーザー</option><option value="moderator">モデレーター</option><option value="admin">管理者</option><option value="debugger">デバッカー</option></select></label><label>BAN解除予定<select id="user-expiry-filter"><option value="all">すべて</option><option value="soon">7日以内</option><option value="expired">期限超過</option><option value="indefinite">無期限</option></select></label><button class="admin-btn" id="user-filter-reset" type="button">絞り込み解除</button></div><div id="user-expiry-summary" class="user-expiry-summary"></div>';panel.insertBefore(c,wrap);}
 let d=$("user-detail-dialog");if(!d){d=document.createElement("dialog");d.id="user-detail-dialog";d.className="user-detail-dialog";d.innerHTML='<div class="user-detail-head"><div><h2 id="user-detail-title">ユーザー詳細</h2><p id="user-detail-subtitle" class="admin-muted"></p></div><button id="user-detail-close" type="button" class="admin-btn">閉じる</button></div><div id="user-detail-content"></div>';document.body.appendChild(d);}
 if(!$("user-tools-toolbar")){const toolbar=document.createElement("div");toolbar.id="user-tools-toolbar";toolbar.style.cssText="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0";toolbar.innerHTML='<label style="display:flex;align-items:center;gap:8px;font-weight:600">並び替え<select id="user-sort-mode" class="admin-search" style="width:auto"><option value="newest">登録日が新しい順</option><option value="oldest">登録日が古い順</option><option value="name">表示名・ユーザー名順</option><option value="role">権限順</option><option value="status">状態順</option></select></label><button id="user-export-csv" class="admin-btn" type="button">表示中のユーザーをCSV出力</button><span id="user-result-count" class="admin-muted" aria-live="polite"></span>';const filters=$("user-tools-controls").querySelector(".user-tools-filters");if(filters)filters.parentNode.insertBefore(toolbar,filters);else $("user-tools-controls").appendChild(toolbar);$("user-sort-mode").onchange=filterRows;$("user-export-csv").onclick=exportVisibleCsv;}
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
 return {row:r,id:s?.dataset.id||ro?.dataset.id||ex?.dataset.id,status:s?.value||(cellText(3).includes("BAN")?"banned":"active"),role:ro?.value||(cellText(2).includes("オーナー")?"owner":cellText(2).includes("管理者")?"admin":cellText(2).includes("モデレーター")?"moderator":cellText(2).includes("デバッカー")?"debugger":"user"),expiry:ex?.value||"",name:cellText(1)||cellText(0)||"ユーザー",username:cellText(0),registered:cellText(4)||"-",registeredAt:r.dataset.createdAt||"",reason:cells[3]?.querySelector(".admin-muted")?.textContent||""};
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
 const visible=[];
 rows.forEach(x=>{const t=x.expiry?new Date(x.expiry).getTime():null,expiryOk=mode==="all"||(mode==="soon"&&x.status==="banned"&&t!==null&&t>now&&t<=week)||(mode==="expired"&&x.status==="banned"&&t!==null&&t<=now)||(mode==="indefinite"&&x.status==="banned"&&!x.expiry);const match=x.row.textContent.toLowerCase().includes(q)&&(status==="all"||x.status===status)&&(role==="all"||x.role===role)&&expiryOk;x.row.hidden=!match;if(match)visible.push(x)});
 const sort=$("user-sort-mode")?.value||"newest";
 const roleOrder={owner:0,admin:1,moderator:2,debugger:3,user:4},statusOrder={banned:0,suspended:1,active:2};
 visible.sort((a,b)=>sort==="oldest"?(Date.parse(a.registeredAt)||0)-(Date.parse(b.registeredAt)||0):sort==="name"?a.name.localeCompare(b.name,"ja"):sort==="role"?(roleOrder[a.role]??9)-(roleOrder[b.role]??9):sort==="status"?(statusOrder[a.status]??9)-(statusOrder[b.status]??9):(Date.parse(b.registeredAt)||0)-(Date.parse(a.registeredAt)||0));
 const body=$("users-body");if(body){const current=[...body.querySelectorAll("tr")].filter(r=>!r.hidden&&r.querySelector(".account-status,.user-role-select"));if(current.length!==visible.length||current.some((r,i)=>r!==visible[i].row)){visible.forEach(x=>body.appendChild(x.row));}}
 if($("user-result-count"))$("user-result-count").textContent="表示中 "+visible.length+" / "+rows.length+" 人";
}
function exportVisibleCsv(){
 const visible=rows.filter(x=>!x.row.hidden);
 if(!visible.length){alert("出力できるユーザーがいません。絞り込み条件を確認してください。");return}
 const quote=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
 const data=[["ユーザーID","ユーザー名","表示名","権限","状態","登録日","BAN解除日時","制限理由"],...visible.map(x=>[x.id,x.username,x.name,labels[x.role]||x.role,labels[x.status]||x.status,x.registered,x.expiry?fmt(x.expiry):(x.status==="banned"?"無期限":""),x.reason])];
 const csv="\uFEFF"+data.map(row=>row.map(quote).join(",")).join("\r\n");
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download="kizimin-users-"+new Date().toISOString().slice(0,10)+".csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
async function details(id){
 const x=rows.find(a=>a.id===id);if(!x)return;
 const row=x.row;
 const roleSelect=row.querySelector(".user-role-select");
 const statusSelect=row.querySelector(".account-status");
 const expiryInput=row.querySelector(".ban-expires");
 const officialButton=row.querySelector(".user-official-toggle");
 const identityButton=row.querySelector(".user-identity-edit");
 const deleteButton=row.querySelector(".user-delete");
 const warningButton=row.querySelector(".user-warning-open");
 const canManageState=!!row.querySelector(".account-status-save");
 const actions=[];
 if(canManageState){
   actions.push('<label class="user-detail-field"><span>アカウント状態</span><select id="user-detail-status"><option value="active">有効（制限解除）</option><option value="banned">BAN</option><option value="suspended">一時停止</option></select></label>');
   actions.push('<label class="user-detail-field" id="user-detail-expiry-wrap"><span>BAN解除日時（任意）</span><input id="user-detail-expiry" type="datetime-local" step="1"></label>');
   actions.push('<button type="button" class="admin-btn primary" id="user-detail-save-status">状態を保存</button>');
 }
 if(roleSelect){
   actions.push('<label class="user-detail-field"><span>権限</span><select id="user-detail-role">'+Array.from(roleSelect.options).map(o=>'<option value="'+esc(o.value)+'">'+esc(o.textContent)+'</option>').join("")+'</select></label>');
   actions.push('<button type="button" class="admin-btn" id="user-detail-save-role">権限を変更</button>');
 }
 if(officialButton)actions.push('<button type="button" class="admin-btn user-detail-official" id="user-detail-official">'+esc(officialButton.textContent.trim())+'</button>');
 if(identityButton)actions.push('<button type="button" class="admin-btn" id="user-detail-identity">ユーザー名・表示名を変更</button>');
 if(warningButton)actions.push('<button type="button" class="admin-btn" id="user-detail-warning">警告を送信</button>');
 if(["admin","owner"].includes(window.__kiziminCurrentUserRole))actions.push('<button type="button" class="admin-btn" id="user-detail-force-password">次回ログイン時にパスワード変更を必須にする</button>');
 if(window.__kiziminCurrentUserRole==="owner")actions.push('<button type="button" class="admin-btn" id="user-detail-reset-password">パスワード再設定メールを送信</button>');
 if(deleteButton)actions.push('<button type="button" class="admin-btn danger" id="user-detail-delete">アカウントを強制削除</button>');
 $("user-detail-title").textContent=x.name;
 $("user-detail-subtitle").textContent="ユーザーID: "+id;
 const copyIdButton=document.createElement("button");copyIdButton.type="button";copyIdButton.className="admin-btn";copyIdButton.textContent="ユーザーIDをコピー";copyIdButton.style.marginTop="8px";copyIdButton.onclick=async()=>{try{await navigator.clipboard.writeText(id);copyIdButton.textContent="コピーしました";setTimeout(()=>{copyIdButton.textContent="ユーザーIDをコピー"},1500)}catch{prompt("ユーザーIDをコピーしてください",id)}};$("user-detail-subtitle").appendChild(document.createTextNode(" "));$("user-detail-subtitle").appendChild(copyIdButton);
 $("user-detail-content").innerHTML='<div class="user-detail-grid"><div><span>表示名</span><strong>'+esc(x.name)+'</strong></div><div><span>ユーザー名</span><strong>'+esc(x.username)+'</strong></div><div><span>メールアドレス</span><strong id="user-detail-email" class="user-detail-email">権限を確認して取得しています...</strong></div><div><span>権限</span><strong>'+esc(labels[x.role]||x.role)+'</strong></div><div><span>状態</span><strong>'+esc(labels[x.status]||x.status)+'</strong></div><div><span>登録日</span><strong>'+esc(x.registered)+'</strong></div><div><span>BAN解除日時（JST）</span><strong>'+esc(x.expiry?fmt(x.expiry):(x.status==="banned"?"無期限":"-"))+'</strong></div><div class="user-detail-wide"><span>制限理由</span><p>'+esc(x.reason||"記録なし")+'</p></div></div><section class="user-detail-actions"><h3>ユーザー操作</h3><p class="admin-muted">表示される操作は、現在の管理権限に応じて変わります。</p><div class="user-detail-action-grid">'+(actions.length?actions.join(""):'<p class="admin-muted">このアカウントに対して実行できる操作はありません。</p>')+'</div></section><h3>関連通報・運営通知</h3><div id="user-activity-loading" class="admin-muted">履歴を読み込んでいます...</div>';
 const dialog=$("user-detail-dialog");
 dialog.showModal();
 if(statusSelect){
   $("user-detail-status").value=statusSelect.value;
   $("user-detail-expiry").value=expiryInput?.value||"";
   const syncExpiry=()=>{$("user-detail-expiry-wrap").style.display=$("user-detail-status").value==="banned"?"grid":"none"};
   $("user-detail-status").addEventListener("change",syncExpiry);syncExpiry();
 }
 if(canManageState){
   $("user-detail-save-status").onclick=()=>{
     const targetStatus=$("user-detail-status").value;
     statusSelect.value=targetStatus;
     statusSelect.dispatchEvent(new Event("change",{bubbles:true}));
     if(expiryInput)expiryInput.value=$("user-detail-expiry").value;
     const save=row.querySelector(".account-status-save");
     if(save){save.click();dialog.close();}
   };
 }
 if(roleSelect){
   $("user-detail-role").value=roleSelect.value;
   $("user-detail-save-role").onclick=()=>{
     roleSelect.value=$("user-detail-role").value;
     roleSelect.dispatchEvent(new Event("change",{bubbles:true}));
     dialog.close();
   };
 }
 if(officialButton)$("user-detail-official").onclick=()=>{officialButton.click();dialog.close()};
 if(identityButton)$("user-detail-identity").onclick=()=>{identityButton.click();dialog.close()};
 if(warningButton)$("user-detail-warning").onclick=()=>{warningButton.click();dialog.close()};
 const client=window.supabase.createClient("https://bimddapbkdakspjaemsm.supabase.co","sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf");
 if($("user-detail-force-password"))$("user-detail-force-password").onclick=async()=>{
   if(!confirm(x.name+" に次回ログイン時のパスワード変更を必須にしますか？"))return;
   const button=$("user-detail-force-password");button.disabled=true;
   try{const r=await client.functions.invoke("secure-content",{body:{action:"admin_force_password_change",user_id:id}});if(r.error||!r.data?.ok)throw new Error(r.data?.error||r.error?.message||"更新失敗");alert("次回ログイン時にパスワード変更が必要になりました。");dialog.close();}
   catch(e){console.error(e);alert("強制変更を設定できませんでした: "+(e.message||"不明なエラー"));button.disabled=false;}
 };
 if($("user-detail-reset-password"))$("user-detail-reset-password").onclick=async()=>{
   if(!confirm(x.name+" の登録メールアドレスにパスワード再設定メールを送信しますか？"))return;
   const button=$("user-detail-reset-password");button.disabled=true;
   try{const r=await client.functions.invoke("secure-content",{body:{action:"admin_send_password_reset",user_id:id}});if(r.error||!r.data?.ok)throw new Error(r.data?.error||r.error?.message||"送信失敗");alert("パスワード再設定メールを送信しました。\n送信先: "+(r.data.email||"登録メールアドレス"));dialog.close();}
   catch(e){console.error(e);alert("再設定メールを送信できませんでした: "+(e.message||"不明なエラー"));button.disabled=false;}
 };
 if(deleteButton)$("user-detail-delete").onclick=()=>{deleteButton.click();dialog.close()};
 try{
   const emailResult=await client.functions.invoke("secure-content",{body:{action:"admin_user_details",user_id:id}});
   const emailEl=$("user-detail-email");
   if(emailEl){
     if(emailResult.error||!emailResult.data?.ok)emailEl.textContent="メールアドレスを取得できません（権限またはサーバー設定を確認）";
     else emailEl.textContent=emailResult.data.email||"登録なし";
   }
 }catch(e){const emailEl=$("user-detail-email");if(emailEl)emailEl.textContent="メールアドレスを取得できません";}
 try{
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