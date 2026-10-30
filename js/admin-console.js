(() => {
"use strict";
const URL="https://bimddapbkdakspjaemsm.supabase.co";
const KEY="sb_publishable_JSnuaf48KMeQ4sodofBg8A_RGlhFHpf";
const db=window.supabase.createClient(URL,KEY);
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const out=(s,type="info")=>{const el=$("kcmd-output");if(!el)return;const line=document.createElement("div");line.className="kcmd-line "+type;line.textContent=s;el.appendChild(line);el.scrollTop=el.scrollHeight;};
const fmt=s=>s?new Date(s).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}):"-";
let role="user",owner=false,ready=false;
function tokenize(input){const a=[];input.replace(/"([^"]*)"|'([^']*)'|(\S+)/g,(_,d,s,w)=>a.push(d??s??w));return a;}
async function init(){
 const {data:{session}}=await db.auth.getSession();if(!session?.user?.id)throw Error("ログインセッションがありません。");
 const {data:p,error}=await db.from("profiles").select("role,account_status").eq("id",session.user.id).maybeSingle();
 if(error)throw error;if(!p||p.account_status&&p.account_status!=="active")throw Error("有効な管理者プロフィールを確認できません。");
 const {data:o,error:oe}=await db.rpc("is_site_owner");if(oe)throw oe;owner=o===true;role=owner?"owner":p.role;
 if(!owner&&!["admin","moderator"].includes(role))throw Error("コマンドコンソールは管理者・オーナー専用です。");
 $("kcmd-auth").textContent="認証済み · "+role;$("kcmd-auth").classList.add("ok");ready=true;
 out("Kizimin Command Console 起動。/kizimin help でコマンド一覧を表示します。","success");
}
async function profile(target){
 let q=db.from("profiles").select("id,username,display_name,role,account_status,ban_reason,ban_expires_at").limit(2);
 if(/^[0-9a-f-]{36}$/i.test(target))q=q.eq("id",target);else q=q.ilike("username",target.replace(/^@/,""));
 const {data,error}=await q;if(error)throw error;
 if(!data?.length)throw Error("ユーザーが見つかりません: "+target);
 if(data.length>1)throw Error("同じユーザー名が複数あります。ユーザーIDを指定してください。");
 return data[0];
}
async function secure(action,extra={}){
 const {data:{session},error:se}=await db.auth.getSession();if(se)throw se;if(!session?.access_token)throw Error("ログインセッションが切れています。");
 const {data,error}=await db.functions.invoke("secure-content",{body:{action,...extra},headers:{Authorization:"Bearer "+session.access_token,apikey:KEY}});
 if(error)throw error;if(data?.error||data?.ok===false)throw Error(data.error||"処理に失敗しました。");return data;
}
async function execute(raw){
 if(!ready)throw Error("権限確認が完了していません。");
 const t=tokenize(raw.trim().replace(/^\/kizimin\s*/i,""));if(!t.length)return;
 const [a,b,c,...rest]=t, target=b, value=c, extra=rest.join(" ");
 if(a==="help"){out("利用可能なコマンド:");[
 "/kizimin help","/kizimin status","/kizimin users [検索語]","/kizimin user <名前|ID>",
 "/kizimin user ban <名前|ID> <理由>","/kizimin user unban <名前|ID>","/kizimin user role <名前|ID> <user|moderator|admin|debugger>",
 "/kizimin articles [検索語]","/kizimin article status <記事ID> <draft|published|archived>","/kizimin article delete <記事ID>",
 "/kizimin comments [検索語]","/kizimin comment status <コメントID> <visible|hidden|deleted>","/kizimin comment delete <コメントID>",
 "/kizimin reports [open|all]","/kizimin report status <通報ID> <open|reviewing|resolved|dismissed>",
 "/kizimin inquiries [open|all]","/kizimin inquiry status <問い合わせID> <open|reviewing|resolved|closed|dismissed>",
 "/kizimin maintenance status|on|off|reason <理由>","/kizimin bot status|run|stop"
 ].forEach(x=>out("  "+x));return;}
 if(a==="status"){
  const [dash,maint]=await Promise.all([db.rpc("admin_dashboard_stats"),db.from("site_settings").select("maintenance_mode,maintenance_type,maintenance_reason").eq("id",true).maybeSingle()]);
  if(dash.error)throw dash.error;if(maint.error)throw maint.error;
  const s=dash.data?.totals||{},m=maint.data||{};
  out("ユーザー "+(s.users??"?")+" / 記事 "+(s.articles??"?")+" / 未処理通報 "+(s.open_reports??"?")+" / 未対応問い合わせ "+(s.open_inquiries??"?"));
  out("メンテナンス: "+(m.maintenance_mode?"ON":"OFF")+" · "+(m.maintenance_type||"normal")+" · "+(m.maintenance_reason||"理由未設定"));
  out("Bot: "+($("bot-running-state")?.textContent||"状態不明"));return;
 }
 if(a==="users"){
  let q=db.from("profiles").select("id,username,display_name,role,account_status,created_at").order("created_at",{ascending:false}).limit(30);
  if(target)q=q.or("username.ilike.%"+target+"%,display_name.ilike.%"+target+"%");
  const {data,error}=await q;if(error)throw error;
  out("ユーザー "+data.length+" 件（最大30件）");
  data.forEach(x=>out((x.username||x.id)+" | "+(x.display_name||"-")+" | "+x.role+" | "+(x.account_status||"active")+" | "+x.id));return;
 }
 if(a==="user"){
  if(b==="ban"||b==="unban"){
   const who=c,reason=extra;if(!who)throw Error("対象ユーザーを指定してください。");
   const u=await profile(who);if(u.id==="9589135e-4f75-4913-b13f-35407eeedf3b")throw Error("オーナーアカウントは変更できません。");
   if(b==="ban"&&!reason.trim())throw Error("BAN理由を指定してください。例: /kizimin user ban @name \"規約違反\"");
   if(!confirm((b==="ban"?"BAN":"BAN解除")+"を実行しますか？\n"+u.username+" ("+u.id+")"+(reason?"\n理由: "+reason:"")))return;
   const {error}=await db.rpc("admin_set_account_status",{p_target_id:u.id,p_status:b==="ban"?"banned":"active",p_reason:b==="ban"?reason:null,p_expires_at:null});if(error)throw error;
   out(u.username+" の状態を"+(b==="ban"?"BAN":"有効")+"に変更しました。","success");return;
  }
  if(b==="role"){
   if(!owner)throw Error("ロール変更はオーナー専用です。");
   const u=await profile(c);if(!["user","moderator","admin","debugger"].includes(value))throw Error("ロールは user / moderator / admin / debugger から指定してください。");
   if(!confirm(u.username+" のロールを "+value+" に変更しますか？"))return;
   const {error}=await db.rpc("admin_change_profile_role",{p_target_id:u.id,p_new_role:value});if(error)throw error;
   out(u.username+" のロールを "+value+" に変更しました。","success");return;
  }
  const u=await profile(b);out("ユーザー: "+(u.display_name||u.username));out("ID: "+u.id);out("ユーザー名: "+u.username);out("ロール: "+u.role);out("状態: "+(u.account_status||"active"));out("制限理由: "+(u.ban_reason||"-"));out("解除日時: "+fmt(u.ban_expires_at));return;
 }
 if(a==="articles"){
  let q=db.from("articles").select("id,title,status,created_at").order("created_at",{ascending:false}).limit(30);
  if(target)q=q.ilike("title","%"+target+"%");
  const {data,error}=await q;if(error)throw error;out("記事 "+data.length+" 件（最大30件）");data.forEach(x=>out(x.title+" | "+x.status+" | "+x.id));return;
 }
 if(a==="article"){
  if(b==="delete"){if(!["admin","owner"].includes(role))throw Error("記事削除は管理者・オーナー専用です。");if(!c)throw Error("記事IDを指定してください。");if(!confirm("記事 "+c+" を完全削除しますか？関連データも削除される場合があります。"))return;await secure("article_delete",{article_id:c});out("記事を削除しました: "+c,"success");return;}
  if(b==="status"){if(!["admin","owner"].includes(role))throw Error("記事更新は管理者・オーナー専用です。");if(!c||!["draft","published","archived"].includes(value))throw Error("記事IDと draft/published/archived を指定してください。");const {data,error}=await db.from("articles").update({status:value}).eq("id",c).select("id").maybeSingle();if(error)throw error;if(!data)throw Error("記事が見つからないか、更新権限がありません。");out("記事状態を "+value+" に変更しました。","success");return;}
 }
 if(a==="comments"){
  const r=await secure("admin_comments_list");let rows=r.comments||[];if(target)rows=rows.filter(x=>String(x.content||"").toLowerCase().includes(target.toLowerCase()));out("コメント "+rows.length+" 件（検索結果、最大取得分）");rows.slice(0,30).forEach(x=>out(String(x.content||"").slice(0,100)+" | "+x.status+" | "+x.id));return;
 }
 if(a==="comment"){
  if(b==="delete"){if(!["admin","moderator","owner"].includes(role))throw Error("コメント削除権限がありません。");if(!c)throw Error("コメントIDを指定してください。");if(!confirm("コメント "+c+" を完全削除しますか？"))return;await secure("comment_delete",{comment_id:c});out("コメントを削除しました。","success");return;}
  if(b==="status"){if(!c||!["visible","hidden","deleted"].includes(value))throw Error("コメントIDと visible/hidden/deleted を指定してください。");await secure("comment_status",{comment_id:c,status:value});out("コメント状態を "+value+" に変更しました。","success");return;}
 }
 if(a==="reports"){
  const {data,error}=await db.from("reports").select("id,reason,status,created_at").order("created_at",{ascending:false}).limit(30);if(error)throw error;const rows=target==="open"?data.filter(x=>["open","reviewing"].includes(x.status)):data;out("通報 "+rows.length+" 件");rows.forEach(x=>out(x.status+" | "+String(x.reason||"").slice(0,100)+" | "+x.id));return;
 }
 if(a==="report"&&b==="status"){
  if(!["open","reviewing","resolved","dismissed"].includes(value))throw Error("状態は open/reviewing/resolved/dismissed です。");const {error}=await db.from("reports").update({status:value,resolved_at:["resolved","dismissed"].includes(value)?new Date().toISOString():null}).eq("id",c);if(error)throw error;out("通報状態を更新しました。","success");return;
 }
 if(a==="inquiries"){
  const {data,error}=await db.from("inquiries").select("id,subject,message,status,created_at").order("created_at",{ascending:false}).limit(30);if(error)throw error;const rows=target==="open"?data.filter(x=>["open","reviewing"].includes(x.status)):data;out("問い合わせ "+rows.length+" 件");rows.forEach(x=>out(x.status+" | "+x.subject+" | "+x.id));return;
 }
 if(a==="inquiry"&&b==="status"){
  if(!["open","reviewing","resolved","closed","dismissed"].includes(value))throw Error("状態を確認してください。");const {error}=await db.rpc("admin_update_inquiry_by_id",{p_inquiry_id:Number(c),p_status:value,p_admin_note:""});if(error)throw error;out("問い合わせ状態を更新しました。","success");return;
 }
 if(a==="maintenance"){
  if(b==="status"){const {data,error}=await db.from("site_settings").select("maintenance_mode,maintenance_type,maintenance_reason").eq("id",true).maybeSingle();if(error)throw error;out("メンテナンス "+(data?.maintenance_mode?"ON":"OFF")+" · "+(data?.maintenance_type||"normal")+" · "+(data?.maintenance_reason||"理由未設定"));return;}
  if(!owner)throw Error("メンテナンス操作はオーナー専用です。");
  if(b==="reason"){if(!extra.trim())throw Error("理由を入力してください。");const {error}=await db.rpc("admin_set_maintenance_reason",{p_reason:[c,...rest].join(" ")});if(error)throw error;out("メンテナンス理由を保存しました。","success");return;}
  if(b==="on"||b==="off"){if(b==="on"){const {data,error}=await db.from("site_settings").select("maintenance_reason").eq("id",true).maybeSingle();if(error)throw error;if(!data?.maintenance_reason?.trim())throw Error("先に /kizimin maintenance reason \"理由\" で理由を設定してください。");}
   if(!confirm("メンテナンスを "+(b==="on"?"有効":"無効")+" にしますか？"))return;const {error}=await db.rpc("admin_set_maintenance_mode",{p_enabled:b==="on"});if(error)throw error;out("メンテナンスを "+(b==="on"?"ON":"OFF")+" にしました。","success");return;}
 }
 if(a==="bot"){
  if(b==="status"){out("Bot: "+($("bot-running-state")?.textContent||"状態不明"));out("最終実行: "+($("bot-last-run")?.textContent||"未実行"));out("状態: "+($("bot-status")?.textContent||""));return;}
  const btn=$(b==="run"?"bot-run-now":b==="stop"?"bot-stop":null);if(!btn)throw Error("bot status / run / stop を指定してください。");btn.click();out(b==="run"?"Botチェックを開始しました。":"Bot停止を要求しました。","success");return;
 }
 throw Error("不明なコマンドです。/kizimin help で一覧を確認してください。");
}
function bind(){
 const form=$("kcmd-form"),input=$("kcmd-input");if(!form||form.dataset.bound)return;form.dataset.bound="1";
 form.addEventListener("submit",async e=>{e.preventDefault();const raw=input.value.trim();if(!raw)return;out("> "+raw,"command");input.value="";try{await execute(raw);}catch(err){console.error("[Kizimin Console]",err);out("エラー: "+(err?.message||String(err)),"error");}});
 $("kcmd-clear")?.addEventListener("click",()=>{$("kcmd-output").innerHTML="";});
 input.addEventListener("keydown",e=>{if(e.key==="ArrowUp"){e.preventDefault();input.value="/kizimin help";input.select();}});
}
document.addEventListener("DOMContentLoaded",()=>{bind();init().catch(e=>{console.error(e);$("kcmd-auth").textContent="認証失敗: "+(e.message||e);$("kcmd-auth").classList.add("error");});});
})();