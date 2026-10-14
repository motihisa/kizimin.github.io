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
 box.innerHTML=organizations.map(o=>{const m=members.find(x=>x.organization_id===o.id);return '<article class="org-item"><div class="org-item-head"><div><strong>'+esc(o.name)+'</strong><p class="org-muted">'+esc(types[o.organization_type]||o.organization_type)+' · あなたの役割: '+esc(m?.role||"member")+'</p></div><span class="org-pill">'+esc(statusNames[o.status]||o.status)+'</span></div>'+(m?.role==="owner"||m?.role==="admin"?'<form class="org-edit-form" data-org="'+o.id+'"><div class="org-grid" style="margin-top:14px"><label class="org-field">団体名<input name="name" maxlength="120" required value="'+esc(o.name)+'"></label><label class="org-field">公式サイト<input name="website" type="url" maxlength="500" value="'+esc(o.website||"")+'"></label><label class="org-field" style="grid-column:1/-1">説明<textarea name="description" maxlength="3000">'+esc(o.description||"")+'</textarea></label></div><button class="org-btn secondary" type="submit">団体情報を保存</button></form><div class="org-members"><h3>メンバー管理</h3><div class="org-inline"><input class="member-search" data-org="'+o.id+'" placeholder="ユーザー名または表示名を検索"><select class="member-role" data-org="'+o.id+'"><option value="member">メンバー</option><option value="editor">投稿担当</option><option value="admin">団体管理者</option></select><button class="org-btn secondary member-find" data-org="'+o.id+'" type="button">ユーザー検索</button></div><div id="member-results-'+o.id+'"></div><div id="members-'+o.id+'" class="org-members">メンバーを読み込み中...</div></div>':'<p class="org-muted">メンバー管理は団体代表者・団体管理者のみ利用できます。</p>')+'</article>';}).join("");
 for(const o of organizations){const m=members.find(x=>x.organization_id===o.id);if(m?.role==="owner"||m?.role==="admin")await loadMembers(o.id);}
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
 const form=e.target.closest(".org-edit-form");if(!form)return;e.preventDefault();
 const orgId=form.dataset.org,v=Object.fromEntries(new FormData(form).entries());
 const {error}=await sb.rpc("kizimin_update_organization",{p_organization_id:orgId,p_name:v.name,p_description:v.description,p_website:v.website});
 if(error){console.error(error);alert("団体情報を保存できませんでした。権限や団体の状態を確認してください。");}else{alert("団体情報を保存しました。");await loadOrganizations();}
});
document.addEventListener("click",async e=>{
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