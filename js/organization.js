(() => {
"use strict";
const URL="https://bimddapbkdakspjaemsm.supabase.co";
const KEY="sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
const sb=window.supabase.createClient(URL,KEY);
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let user=null, organizations=[];
const types={company:"企業・事業者",school:"学校・教育関係",circle:"サークル・グループ",community:"オンラインコミュニティ",individual:"個人運営",other:"その他"};
const statusNames={pending:"審査待ち",approved:"承認済み",rejected:"却下",suspended:"停止中"};
function say(el,msg){$(el).textContent=msg;}
async function init(){
 const {data:{session},error}=await sb.auth.getSession();
 if(error||!session?.user){say("org-auth","団体申請にはログインが必要です。ログイン後、このページに戻ってください。");$("org-application-form").querySelectorAll("input,select,textarea,button").forEach(x=>x.disabled=true);$("org-application-list").innerHTML='<a href="login.html">ログインする</a>'; $("org-managed-list").textContent="ログインすると団体管理が表示されます。";return;}
 user=session.user;say("org-auth","ログイン中: "+(user.email||user.id));
 await Promise.all([loadApplications(),loadOrganizations()]);
}
async function loadApplications(){
 const box=$("org-application-list");
 const {data,error}=await sb.from("organization_applications").select("id,organization_name,organization_type,status,review_reason,created_at,reviewed_at").eq("applicant_id",user.id).order("created_at",{ascending:false});
 if(error){box.textContent="申請状況を読み込めませんでした。";console.error(error);return;}
 if(!data?.length){box.innerHTML='<p class="org-muted">申請履歴はありません。</p>';return;}
 box.innerHTML=data.map(a=>'<article class="org-item"><div class="org-item-head"><strong>'+esc(a.organization_name)+'</strong><span class="org-pill">'+esc(statusNames[a.status]||a.status)+'</span></div><p class="org-muted">'+esc(types[a.organization_type]||a.organization_type)+' · '+new Date(a.created_at).toLocaleString("ja-JP")+'</p>'+(a.review_reason?'<p>'+esc(a.review_reason)+'</p>':'')+'</article>').join("");
}
async function loadOrganizations(){
 const box=$("org-managed-list");
 const {data:members,error}=await sb.from("organization_members").select("organization_id,role,status").eq("user_id",user.id).eq("status","active");
 if(error){box.textContent="団体情報を読み込めませんでした。";console.error(error);return;}
 const ids=(members||[]).map(m=>m.organization_id); if(!ids.length){box.innerHTML='<p class="org-muted">承認済みの管理団体はありません。</p>';return;}
 const {data:orgs,error:orgErr}=await sb.from("organizations").select("id,name,organization_type,description,website,status").in("id",ids).order("name");
 if(orgErr){box.textContent="団体情報を読み込めませんでした。";console.error(orgErr);return;}
 organizations=orgs||[];
 box.innerHTML=organizations.map(o=>{const m=members.find(x=>x.organization_id===o.id);return '<article class="org-item"><div class="org-item-head"><div><strong>'+esc(o.name)+'</strong><p class="org-muted">'+esc(types[o.organization_type]||o.organization_type)+' · あなたの役割: '+esc(m?.role||"member")+'</p></div><span class="org-pill">'+esc(statusNames[o.status]||o.status)+'</span></div>'+(m?.role==="owner"||m?.role==="admin"?'<form class="org-edit-form" data-org="'+o.id+'"><div class="org-grid" style="margin-top:14px"><label class="org-field">団体名<input name="name" maxlength="120" required value="'+esc(o.name)+'"></label><label class="org-field">公式サイト<input name="website" type="url" maxlength="500" value="'+esc(o.website||"")+'"></label><label class="org-field" style="grid-column:1/-1">説明<textarea name="description" maxlength="3000">'+esc(o.description||"")+'</textarea></label></div><button class="org-btn secondary" type="submit">団体情報を保存</button></form><div class="org-members"><h3>メンバー管理</h3><div class="org-inline"><input class="member-search" data-org="'+o.id+'" placeholder="ユーザー名または表示名を検索"><select class="member-role" data-org="'+o.id+'"><option value="member">メンバー</option><option value="editor">投稿担当</option><option value="admin">団体管理者</option></select><button class="org-btn secondary member-find" data-org="'+o.id+'" type="button">ユーザー検索</button></div><div id="member-results-'+o.id+'"></div><div id="members-'+o.id+'" class="org-members">メンバーを読み込み中...</div></div>':'<p class="org-muted">メンバー管理は団体代表者・団体管理者のみ利用できます。</p>')+
 '<section class="org-feature"><h3>📌 団体掲示板</h3><p class="org-muted">連絡事項・相談・活動報告を団体メンバー内で共有します。</p>'+
 ((m?.role==="owner"||m?.role==="admin"||m?.role==="editor")?'<form class="org-board-form" data-org="'+o.id+'"><div class="org-grid"><label class="org-field">投稿種別<select name="post_type"><option value="announcement">お知らせ</option><option value="discussion">話題・相談</option></select></label><label class="org-field">タイトル<input name="title" maxlength="180" required placeholder="タイトル"></label><label class="org-field" style="grid-column:1/-1">本文<textarea name="content" maxlength="10000" required placeholder="団体メンバーへの連絡内容"></textarea></label></div><button class="org-btn" type="submit">掲示板に投稿</button></form>':'<p class="org-muted">投稿は代表者・団体管理者・投稿担当ができます。</p>')+
 '<div id="org-board-'+o.id+'" class="org-list">掲示板を読み込み中...</div></section>'+
 '<section class="org-feature"><h3>🗓️ 団体イベント・予定</h3><p class="org-muted">会議、活動日、イベントなどを共有します。</p>'+
 ((m?.role==="owner"||m?.role==="admin"||m?.role==="editor")?'<form class="org-event-form" data-org="'+o.id+'"><div class="org-grid"><label class="org-field">予定名<input name="title" maxlength="180" required></label><label class="org-field">開始日時<input name="starts_at" type="datetime-local" required></label><label class="org-field">終了日時（任意）<input name="ends_at" type="datetime-local"></label><label class="org-field">場所（任意）<input name="location" maxlength="300"></label><label class="org-field" style="grid-column:1/-1">説明<textarea name="description" maxlength="5000"></textarea></label></div><button class="org-btn" type="submit">予定を追加</button></form>':'<p class="org-muted">予定の追加は代表者・団体管理者・投稿担当ができます。</p>')+
 '<div id="org-events-'+o.id+'" class="org-list">予定を読み込み中...</div></section>'+
 '</article>';}).join("");
 for(const o of organizations){const m=members.find(x=>x.organization_id===o.id);if(m?.role==="owner"||m?.role==="admin")await loadMembers(o.id);await Promise.all([loadBoard(o.id),loadEvents(o.id)]);}
}
async function loadBoard(orgId){
 const box=$("org-board-"+orgId);if(!box)return;
 const {data,error}=await sb.from("organization_board_posts").select("id,title,content,post_type,is_pinned,author_id,created_at,profiles!organization_board_posts_author_id_fkey(username,display_name)").eq("organization_id",orgId).order("is_pinned",{ascending:false}).order("created_at",{ascending:false}).limit(100);
 if(error){box.textContent="掲示板を読み込めませんでした。";console.error(error);return;}
 box.innerHTML=(data||[]).map(p=>'<article class="org-item"><div class="org-item-head"><strong>'+ (p.is_pinned?'📌 ':'')+esc(p.title)+'</strong><span class="org-pill">'+(p.post_type==="announcement"?"お知らせ":"話題・相談")+'</span></div><p class="org-muted">'+esc(p.profiles?.display_name||p.profiles?.username||"メンバー")+' · '+new Date(p.created_at).toLocaleString("ja-JP")+'</p><p style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(p.content)+'</p>'+((p.author_id===user.id)?'<button class="org-btn secondary board-delete" type="button" data-org="'+orgId+'" data-id="'+p.id+'">削除</button>':'')+'<span class="org-inline">'+(p.author_id!==user.id?'':'')+'</span></article>').join("")||'<p class="org-muted">掲示板への投稿はまだありません。</p>';
}
async function loadEvents(orgId){
 const box=$("org-events-"+orgId);if(!box)return;
 const {data,error}=await sb.from("organization_events").select("id,title,description,location,starts_at,ends_at,created_by").eq("organization_id",orgId).order("starts_at",{ascending:true}).limit(100);
 if(error){box.textContent="予定を読み込めませんでした。";console.error(error);return;}
 box.innerHTML=(data||[]).map(ev=>'<article class="org-item"><div class="org-item-head"><strong>'+esc(ev.title)+'</strong><span class="org-pill">'+new Date(ev.starts_at).toLocaleString("ja-JP",{dateStyle:"medium",timeStyle:"short"})+'</span></div>'+(ev.ends_at?'<p class="org-muted">終了: '+new Date(ev.ends_at).toLocaleString("ja-JP",{dateStyle:"medium",timeStyle:"short"})+'</p>':'')+(ev.location?'<p>📍 '+esc(ev.location)+'</p>':'')+(ev.description?'<p style="white-space:pre-wrap">'+esc(ev.description)+'</p>':'')+(ev.created_by===user.id?'<button class="org-btn secondary event-delete" type="button" data-org="'+orgId+'" data-id="'+ev.id+'">予定を削除</button>':'')+'</article>').join("")||'<p class="org-muted">予定はまだ登録されていません。</p>';
}
async function loadMembers(orgId){
 const box=$("members-"+orgId);if(!box)return;
 const {data,error}=await sb.from("organization_members").select("user_id,role,status,profiles!organization_members_user_id_fkey(username,display_name)").eq("organization_id",orgId).eq("status","active").order("created_at");
 if(error){box.textContent="メンバーを読み込めませんでした。";console.error(error);return;}
 const currentRole=(data||[]).find(m=>m.user_id===user.id)?.role;
 box.innerHTML=(data||[]).map(m=>'<div class="org-member"><span><strong>'+esc(m.profiles?.display_name||m.profiles?.username||"ユーザー")+'</strong><span class="org-muted"> @'+esc(m.profiles?.username||"unknown")+' · '+esc(m.role)+'</span></span>'+(m.user_id===user.id?'<span class="org-muted">自分</span>':'<span class="org-inline">'+(currentRole==="owner"&&m.role!=="owner"?'<button class="org-btn secondary member-transfer" data-org="'+orgId+'" data-user="'+m.user_id+'" type="button">代表者を引き継ぐ</button>':'')+'<button class="org-btn secondary member-remove" data-org="'+orgId+'" data-user="'+m.user_id+'" type="button">メンバーから外す</button></span>')+'</div>').join("")||'<p class="org-muted">メンバーはいません。</p>';
}
$("org-application-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!user)return;
 const form=e.currentTarget,btn=$("org-apply-button"),v=Object.fromEntries(new FormData(form).entries());
 btn.disabled=true;say("org-application-message","申請を送信しています...");
 const {data:existing}=await sb.from("organization_applications").select("id").eq("applicant_id",user.id).eq("status","pending").limit(1);
 if(existing?.length){say("org-application-message","審査待ちの申請がすでにあります。結果が出てから再申請してください。");btn.disabled=false;return;}
 const {error}=await sb.from("organization_applications").insert({applicant_id:user.id,organization_name:v.organization_name.trim(),organization_type:v.organization_type,description:v.description.trim(),website:v.website.trim()||null,representative_name:v.representative_name.trim(),contact_email:v.contact_email.trim(),status:"pending"});
 if(error){console.error(error);say("org-application-message","申請できませんでした。入力内容とログイン状態を確認してください。");}else{say("org-application-message","申請を受け付けました。管理者の審査結果をこのページで確認できます。");form.reset();await loadApplications();}
 btn.disabled=false;
});
document.addEventListener("submit",async e=>{
 const board=e.target.closest(".org-board-form");
 if(board){e.preventDefault();const v=Object.fromEntries(new FormData(board).entries()),orgId=board.dataset.org,btn=board.querySelector('button[type="submit"]');btn.disabled=true;
  const {error}=await sb.from("organization_board_posts").insert({organization_id:orgId,author_id:user.id,title:v.title.trim(),content:v.content.trim(),post_type:v.post_type});
  if(error){console.error(error);alert("掲示板に投稿できませんでした。団体の状態と権限を確認してください。");}else{board.reset();await loadBoard(orgId);}btn.disabled=false;return;
 }
 const eventForm=e.target.closest(".org-event-form");
 if(eventForm){e.preventDefault();const v=Object.fromEntries(new FormData(eventForm).entries()),orgId=eventForm.dataset.org,btn=eventForm.querySelector('button[type="submit"]');
  const starts=new Date(v.starts_at),ends=v.ends_at?new Date(v.ends_at):null;if(ends&&ends<starts){alert("終了日時は開始日時以降にしてください。");return;}
  btn.disabled=true;const {error}=await sb.from("organization_events").insert({organization_id:orgId,created_by:user.id,title:v.title.trim(),description:v.description.trim(),location:v.location.trim(),starts_at:starts.toISOString(),ends_at:ends?ends.toISOString():null});
  if(error){console.error(error);alert("予定を追加できませんでした。団体の状態と権限を確認してください。");}else{eventForm.reset();await loadEvents(orgId);}btn.disabled=false;return;
 }
});
document.addEventListener("submit",async e=>{
 const form=e.target.closest(".org-edit-form");if(!form)return;e.preventDefault();
 const orgId=form.dataset.org,v=Object.fromEntries(new FormData(form).entries());
 const {error}=await sb.rpc("kizimin_update_organization",{p_organization_id:orgId,p_name:v.name,p_description:v.description,p_website:v.website});
 if(error){console.error(error);alert("団体情報を保存できませんでした。権限や団体の状態を確認してください。");}else{alert("団体情報を保存しました。");await loadOrganizations();}
});
document.addEventListener("click",async e=>{
 const bd=e.target.closest(".board-delete");if(bd){if(!confirm("この掲示板投稿を削除しますか？"))return;bd.disabled=true;const {error}=await sb.from("organization_board_posts").delete().eq("id",bd.dataset.id).eq("organization_id",bd.dataset.org);if(error){console.error(error);alert("投稿を削除できませんでした。");}else await loadBoard(bd.dataset.org);bd.disabled=false;return;}
 const ed=e.target.closest(".event-delete");if(ed){if(!confirm("この予定を削除しますか？"))return;ed.disabled=true;const {error}=await sb.from("organization_events").delete().eq("id",ed.dataset.id).eq("organization_id",ed.dataset.org);if(error){console.error(error);alert("予定を削除できませんでした。");}else await loadEvents(ed.dataset.org);ed.disabled=false;return;}

 const find=e.target.closest(".member-find");
 if(find){const id=find.dataset.org,input=document.querySelector('.member-search[data-org="'+id+'"]'),term=input?.value.trim(),result=$("member-results-"+id);if(!term){result.textContent="ユーザー名か表示名を入力してください。";return;}const {data,error}=await sb.from("profiles").select("id,username,display_name").or("username.ilike.%"+term+"%,display_name.ilike.%"+term+"%").limit(8);if(error){result.textContent="ユーザー検索に失敗しました。";return;}if(!data?.length){result.textContent="該当するユーザーがいません。";return;}result.innerHTML=data.map(p=>'<div class="org-member"><span>'+esc(p.display_name||p.username||"ユーザー")+' @'+esc(p.username||"")+'</span><button class="org-btn secondary member-add" type="button" data-org="'+id+'" data-user="'+p.id+'">追加</button></div>').join("");return;}
 const add=e.target.closest(".member-add");
 if(add){const orgId=add.dataset.org,userId=add.dataset.user,role=document.querySelector('.member-role[data-org="'+orgId+'"]')?.value||"member";add.disabled=true;const {error}=await sb.rpc("kizimin_add_organization_member",{p_organization_id:orgId,p_user_id:userId,p_role:role});if(error){console.error(error);alert("メンバーを追加できませんでした。相手がすでに所属しているか、権限を確認してください。");}else{alert("メンバーを追加しました。");$("member-results-"+orgId).textContent="";await loadMembers(orgId);}add.disabled=false;return;}
 const transfer=e.target.closest(".member-transfer");
 if(transfer){if(!confirm("このメンバーに団体の代表者権限を引き継ぎますか？あなたは団体管理者になります。"))return;transfer.disabled=true;const {error}=await sb.rpc("kizimin_transfer_organization_owner",{p_organization_id:transfer.dataset.org,p_new_owner_id:transfer.dataset.user});if(error){console.error(error);alert("代表者を引き継げませんでした。対象者が有効なメンバーか確認してください。");}else{alert("代表者を引き継ぎました。");await loadOrganizations();}transfer.disabled=false;return;}
 const remove=e.target.closest(".member-remove");
 if(remove){if(!confirm("このユーザーを団体メンバーから外しますか？"))return;remove.disabled=true;const {error}=await sb.rpc("kizimin_remove_organization_member",{p_organization_id:remove.dataset.org,p_user_id:remove.dataset.user});if(error){console.error(error);alert("メンバーを外せませんでした。最後の代表者は削除できません。");}else{await loadMembers(remove.dataset.org);}remove.disabled=false;}
});
init();
})();