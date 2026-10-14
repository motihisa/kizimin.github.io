(() => {
"use strict";
const sb=window.supabase.createClient("https://bimddapbkdakspjaemsm.supabase.co","sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf");
const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const typeName={company:"企業・事業者",school:"学校",circle:"サークル",community:"オンラインコミュニティ",individual:"個人運営",other:"その他"},statusName={pending:"審査待ち",approved:"承認済み",rejected:"却下",suspended:"停止中"};
async function init(){
 const {data:{session}}=await sb.auth.getSession();
 if(!session?.user){$("org-admin-auth").textContent="ログインが必要です。";return;}
 const [{data:profile,error:pe},{data:owner,error:oe}]=await Promise.all([
  sb.from("profiles").select("role,account_status").eq("id",session.user.id).maybeSingle(),
  sb.rpc("is_site_owner")
 ]);
 if(pe||(!owner&&!oe&&(profile?.role!=="admin"))||((profile?.role!=="admin"&&owner!==true))||profile?.account_status&&profile.account_status!=="active"){
  $("org-admin-auth").textContent="団体管理はKiziminの管理者のみ利用できます。";return;
 }
 const {data:isAdmin,error:ie}=await sb.rpc("kizimin_is_platform_admin");
 if(ie||isAdmin!==true){$("org-admin-auth").textContent="管理者権限の確認に失敗しました。";return;}
 $("org-admin-auth").textContent="管理者として認証しました。";$("org-admin-app").hidden=false;await refresh();
}
async function refresh(){await Promise.all([loadApplications(),loadOrganizations(),loadAudit()]);}
async function loadApplications(){
 const box=$("org-admin-applications"),{data,error}=await sb.from("organization_applications").select("id,applicant_id,organization_name,organization_type,description,website,representative_name,contact_email,status,created_at").eq("status","pending").order("created_at",{ascending:true});
 if(error){box.textContent="申請を読み込めませんでした。";console.error(error);return;}
 if(!data?.length){box.innerHTML='<p class="org-admin-muted">審査待ちの申請はありません。</p>';return;}
 box.innerHTML=data.map(a=>'<article class="org-admin-item"><h3>'+esc(a.organization_name)+'</h3><span class="org-admin-status">'+esc(typeName[a.organization_type]||a.organization_type)+'</span><p>'+esc(a.description||"説明なし")+'</p><p class="org-admin-muted">代表者: '+esc(a.representative_name)+' · 連絡先: '+esc(a.contact_email)+'<br>申請者ID: '+esc(a.applicant_id)+'<br>申請日時: '+new Date(a.created_at).toLocaleString("ja-JP")+'</p>'+(a.website?'<p><a href="'+esc(a.website)+'" target="_blank" rel="noopener noreferrer">公式サイトを開く</a></p>':'')+'<label>審査理由（却下時は入力推奨）<textarea class="org-admin-reason" data-reason="'+a.id+'" rows="2" maxlength="1000"></textarea></label><div class="org-admin-actions"><button class="org-admin-btn primary" data-review="approve" data-id="'+a.id+'">承認</button><button class="org-admin-btn danger" data-review="reject" data-id="'+a.id+'">却下</button></div></article>').join("");
}
async function loadOrganizations(){
 const box=$("org-admin-organizations"),{data,error}=await sb.from("organizations").select("id,name,organization_type,description,website,status,created_by,created_at").order("created_at",{ascending:false});
 if(error){box.textContent="団体を読み込めませんでした。";console.error(error);return;}
 if(!data?.length){box.innerHTML='<p class="org-admin-muted">承認済み団体はまだありません。</p>';return;}
 box.innerHTML=data.map(o=>'<article class="org-admin-item"><h3>'+esc(o.name)+'</h3><span class="org-admin-status">'+esc(statusName[o.status]||o.status)+'</span><p class="org-admin-muted">'+esc(typeName[o.organization_type]||o.organization_type)+' · 作成者ID: '+esc(o.created_by)+'<br>'+new Date(o.created_at).toLocaleString("ja-JP")+'</p><p>'+esc(o.description||"")+'</p><div class="org-admin-actions">'+(o.status==="suspended"?'<button class="org-admin-btn primary" data-status="approved" data-id="'+o.id+'">利用再開</button>':'<button class="org-admin-btn danger" data-status="suspended" data-id="'+o.id+'">団体を停止</button>')+'</div></article>').join("");
}
async function loadAudit(){
 const box=$("org-admin-audit"),{data,error}=await sb.from("organization_audit_logs").select("id,organization_id,actor_id,action,target_user_id,details,created_at").order("created_at",{ascending:false}).limit(50);
 if(error){box.textContent="履歴を読み込めませんでした。";console.error(error);return;}
 box.innerHTML=(data||[]).map(x=>'<article class="org-admin-item"><strong>'+esc(x.action)+'</strong><p class="org-admin-muted">'+new Date(x.created_at).toLocaleString("ja-JP")+' · 実行者: '+esc(x.actor_id||"不明")+' · 団体ID: '+esc(x.organization_id||"申請段階")+'</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(JSON.stringify(x.details||{},null,2))+'</pre></article>').join("")||'<p class="org-admin-muted">履歴はありません。</p>';
}
document.addEventListener("click",async e=>{
 const review=e.target.closest("[data-review]");
 if(review){const id=review.dataset.id,decision=review.dataset.review,reason=document.querySelector('[data-reason="'+id+'"]')?.value||"";if(!confirm(decision==="approve"?"この団体申請を承認しますか？":"この団体申請を却下しますか？"))return;review.disabled=true;const {error}=await sb.rpc("kizimin_review_organization_application",{p_application_id:id,p_decision:decision,p_reason:reason});if(error){console.error(error);alert("審査を保存できませんでした。管理者権限とSupabase設定を確認してください。");}else{alert(decision==="approve"?"団体申請を承認しました。":"団体申請を却下しました。");await refresh();}review.disabled=false;return;}
 const status=e.target.closest("[data-status]");
 if(status){const id=status.dataset.id,next=status.dataset.status;if(!confirm(next==="suspended"?"この団体の利用を停止しますか？":"この団体の利用を再開しますか？"))return;status.disabled=true;const {error}=await sb.rpc("kizimin_set_organization_status",{p_organization_id:id,p_status:next,p_reason:"管理画面から変更"});if(error){console.error(error);alert("団体の状態を変更できませんでした。");}else await refresh();status.disabled=false;}
});
init();
})();